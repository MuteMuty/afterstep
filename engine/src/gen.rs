//! Procedural level generator. Deterministic for a given seed.
//!
//! Recipe: scatter walls, seal the exit inside nested "vaults" whose only way in
//! is a door, put each door's plate outside the vault it guards, then keep only
//! candidates the solver proves are solvable, need the echo, and land in the
//! requested difficulty band.

use crate::solver::{solve, solve_without_echo};
use crate::{Game, Level, Tile};

pub struct Rng(u64);

impl Rng {
    pub fn new(seed: u64) -> Rng {
        Rng(seed ^ 0x9E37_79B9_7F4A_7C15 | 1)
    }
    pub fn from_str(s: &str) -> Rng {
        // FNV-1a
        let mut h: u64 = 0xcbf2_9ce4_8422_2325;
        for b in s.bytes() {
            h ^= b as u64;
            h = h.wrapping_mul(0x100_0000_01b3);
        }
        Rng::new(h)
    }
    pub fn next(&mut self) -> u64 {
        // xorshift64*
        self.0 ^= self.0 >> 12;
        self.0 ^= self.0 << 25;
        self.0 ^= self.0 >> 27;
        self.0.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }
    pub fn below(&mut self, n: usize) -> usize {
        (self.next() % n as u64) as usize
    }
    pub fn range(&mut self, lo: usize, hi: usize) -> usize {
        lo + self.below(hi - lo + 1)
    }
    pub fn chance(&mut self, p: f64) -> bool {
        (self.next() >> 11) as f64 / (1u64 << 53) as f64 <= p
    }
}

#[derive(Clone, Debug)]
pub struct Params {
    pub w: usize,
    pub h: usize,
    pub walls: f64,
    pub doors: (usize, usize),
    pub delay: (usize, usize),
    pub moves: (usize, usize),
    pub min_explored: usize,
    pub prefer_desync: bool,
    /// Valid candidates to collect before picking the most interesting one.
    pub candidates: usize,
}

impl Params {
    pub fn tier(name: &str) -> Option<Params> {
        Some(match name {
            "easy" => Params { w: 6, h: 6, walls: 0.22, doors: (1, 1), delay: (2, 3), moves: (8, 16), min_explored: 0, prefer_desync: false, candidates: 24 },
            "medium" => Params { w: 7, h: 7, walls: 0.24, doors: (1, 2), delay: (2, 4), moves: (12, 24), min_explored: 400, prefer_desync: false, candidates: 32 },
            "hard" => Params { w: 8, h: 8, walls: 0.26, doors: (2, 3), delay: (3, 4), moves: (18, 40), min_explored: 2_000, prefer_desync: true, candidates: 40 },
            _ => return None,
        })
    }
}

#[derive(Clone, Debug)]
pub struct Generated {
    pub level: Level,
    pub solution: String,
    pub explored: usize,
    pub desync: bool,
}

const SOLVE_LIMIT: usize = 400_000;

pub fn generate(params: &Params, rng: &mut Rng, max_attempts: usize) -> Option<Generated> {
    let mut best: Option<(f64, Generated)> = None;
    let mut found = 0;
    for _ in 0..max_attempts {
        let Some(level) = candidate(params, rng) else { continue };
        let Some(sol) = solve(&level, SOLVE_LIMIT) else { continue };
        let n = sol.moves.len();
        if n < params.moves.0 || n > params.moves.1 || sol.explored < params.min_explored {
            continue;
        }
        if solve_without_echo(&level, SOLVE_LIMIT).is_some() {
            continue;
        }
        let desync = desyncs(&level, &sol.moves);
        let mut score = (sol.explored as f64).ln() + n as f64 * 0.05;
        if params.prefer_desync && desync {
            score += 2.0;
        }
        let g = Generated { level, solution: sol.moves, explored: sol.explored, desync };
        if best.as_ref().map_or(true, |(s, _)| score > *s) {
            best = Some((score, g));
        }
        found += 1;
        if found >= params.candidates {
            break;
        }
    }
    best.map(|(_, g)| g)
}

fn desyncs(level: &Level, moves: &str) -> bool {
    let mut g = Game::new(level.clone());
    for c in moves.chars() {
        g.try_step(crate::Action::from_char(c).unwrap());
    }
    g.echo_blocked.iter().any(|b| *b)
}

fn neighbors(w: usize, h: usize, i: usize) -> impl Iterator<Item = usize> {
    let (x, y) = (i % w, i / w);
    let mut v = [usize::MAX; 4];
    if y > 0 { v[0] = i - w; }
    if y + 1 < h { v[1] = i + w; }
    if x > 0 { v[2] = i - 1; }
    if x + 1 < w { v[3] = i + 1; }
    v.into_iter().filter(|&n| n != usize::MAX)
}

fn candidate(p: &Params, rng: &mut Rng) -> Option<Level> {
    let (w, h) = (p.w, p.h);
    let n = w * h;
    let mut t = vec![Tile::Floor; n];
    for c in t.iter_mut() {
        if rng.chance(p.walls) {
            *c = Tile::Wall;
        }
    }
    let exit = rng.below(n);
    t[exit] = Tile::Exit;

    // Nested vaults around the exit.
    let doors = rng.range(p.doors.0, p.doors.1);
    let mut inside = vec![false; n];
    inside[exit] = true;
    let mut guarded: Vec<Vec<bool>> = Vec::new(); // region guarded by door i
    for d in 0..doors {
        // grow the region
        let grow = rng.range(0, 3 + d * 2);
        for _ in 0..grow {
            let frontier: Vec<usize> = (0..n)
                .filter(|&i| !inside[i] && t[i] != Tile::Wall && neighbors(w, h, i).any(|j| inside[j]))
                .collect();
            if frontier.is_empty() {
                break;
            }
            inside[frontier[rng.below(frontier.len())]] = true;
        }
        // boundary cells become walls, except one door
        let boundary: Vec<usize> = (0..n)
            .filter(|&i| !inside[i] && t[i] != Tile::Wall && neighbors(w, h, i).any(|j| inside[j]))
            .collect();
        let door_spots: Vec<usize> = boundary
            .iter()
            .copied()
            .filter(|&i| neighbors(w, h, i).any(|j| !inside[j] && t[j] != Tile::Wall && !boundary.contains(&j)))
            .collect();
        if door_spots.is_empty() {
            return None;
        }
        let door = door_spots[rng.below(door_spots.len())];
        for &b in &boundary {
            t[b] = Tile::Wall;
        }
        t[door] = Tile::Door(d as u8);
        inside[door] = true;
        guarded.push(inside.clone());
    }

    // Plates go outside the region their own door guards.
    let mut taken = vec![false; n];
    for (d, region) in guarded.iter().enumerate() {
        let spots: Vec<usize> = (0..n).filter(|&i| !region[i] && t[i] == Tile::Floor && !taken[i]).collect();
        if spots.is_empty() {
            return None;
        }
        let s = spots[rng.below(spots.len())];
        t[s] = Tile::Plate(d as u8);
        taken[s] = true;
    }

    // Start: outside every vault.
    let outer = guarded.last()?;
    let spots: Vec<usize> = (0..n).filter(|&i| !outer[i] && t[i] == Tile::Floor).collect();
    if spots.is_empty() {
        return None;
    }
    let start = spots[rng.below(spots.len())];

    // Wall off anything unreachable even with every door open (keeps levels tidy).
    let mut reach = vec![false; n];
    let mut stack = vec![start];
    reach[start] = true;
    while let Some(i) = stack.pop() {
        for j in neighbors(w, h, i) {
            if !reach[j] && t[j] != Tile::Wall {
                reach[j] = true;
                stack.push(j);
            }
        }
    }
    if !reach[exit] {
        return None;
    }
    for i in 0..n {
        if !reach[i] {
            t[i] = Tile::Wall;
        }
    }

    let delay = rng.range(p.delay.0, p.delay.1);
    Some(Level { w, h, tiles: t, start, exit, delay })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deterministic_for_seed() {
        let p = Params::tier("easy").unwrap();
        let a = generate(&p, &mut Rng::from_str("2026-11-11"), 20_000).unwrap();
        let b = generate(&p, &mut Rng::from_str("2026-11-11"), 20_000).unwrap();
        assert_eq!(a.level, b.level);
    }

    #[test]
    fn generated_levels_are_valid() {
        for tier in ["easy", "medium"] {
            let p = Params::tier(tier).unwrap();
            let g = generate(&p, &mut Rng::from_str(tier), 50_000).expect(tier);
            assert!(Game::verify(&g.level, &g.solution));
            assert!(solve_without_echo(&g.level, SOLVE_LIMIT).is_none());
            assert!(g.solution.len() >= p.moves.0 && g.solution.len() <= p.moves.1);
        }
    }
}
