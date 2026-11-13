//! Breadth-first solver. Finds the shortest winning action sequence.
//!
//! State = (player, echo, the last `delay` actions). The echo's future is fully
//! determined by your last `delay` actions, so that queue is all we need to remember.
//! That also means a search can start from any position mid-game, which is what
//! [`hint`] does.

use crate::{Action, Game, Level};
use std::collections::{HashMap, HashSet, VecDeque};
use std::hash::{BuildHasherDefault, Hash, Hasher};

#[derive(Debug, Clone)]
pub struct Solution {
    /// Shortest winning action sequence, as a string like "RRD.U".
    pub moves: String,
    /// Number of distinct states explored before the solution was found.
    pub explored: usize,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
struct State {
    player: u8,
    echo: u8,   // 255 = not spawned
    len: u8,    // actions remembered (min(t, delay))
    queue: u16, // base-5 digits, oldest = most significant
}

impl Hash for State {
    #[inline]
    fn hash<H: Hasher>(&self, h: &mut H) {
        h.write_u64(
            self.player as u64 | (self.echo as u64) << 8 | (self.len as u64) << 16 | (self.queue as u64) << 24,
        );
    }
}

/// A small, fast hasher for packed states (the default SipHash is several times slower here).
#[derive(Default)]
struct StateHasher(u64);

impl Hasher for StateHasher {
    fn finish(&self) -> u64 {
        // splitmix64 finaliser: every input bit reaches both the low (bucket) and high (tag) bits.
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
        z ^ (z >> 31)
    }
    fn write(&mut self, bytes: &[u8]) {
        for &b in bytes {
            self.0 = (self.0 << 8 | self.0 >> 56) ^ b as u64;
        }
    }
    fn write_u64(&mut self, v: u64) {
        self.0 ^= v;
    }
}

type Fast = BuildHasherDefault<StateHasher>;

const NONE: u8 = 255;

fn pow5(n: u8) -> u16 {
    5u16.pow(n as u32)
}

impl State {
    fn oldest(&self) -> Action {
        Action::from_u8((self.queue / pow5(self.len - 1)) as u8).unwrap()
    }

    /// The state of a game in progress.
    fn of(game: &Game) -> State {
        let k = game.level.delay;
        let t = game.history.len();
        let recent = &game.history[t.saturating_sub(k)..];
        State {
            player: game.player as u8,
            echo: game.echo.map_or(NONE, |e| e as u8),
            len: recent.len() as u8,
            queue: recent.iter().fold(0, |q, &a| q * 5 + a as u16),
        }
    }

    /// True if, going from `self` to `next`, the echo tried to move and was blocked.
    fn echo_bumps(self, next: State) -> bool {
        self.echo != NONE && self.oldest() != Action::Wait && next.echo == self.echo
    }

    /// The state after taking `a`, or `None` if the move is blocked. With
    /// `rules` [`Rules::InSync`] the echo walks through closed doors.
    #[inline]
    fn next(self, level: &Level, a: Action, rules: Rules) -> Option<State> {
        let with_echo = rules != Rules::NoEcho;
        let k = level.delay as u8;
        let s = self;
        let echo = if s.echo == NONE { None } else { Some(s.echo as usize) };
        let (spawn, echo_action, nlen, nqueue) = if !with_echo {
            (false, None, 0, 0)
        } else if s.len < k {
            let nq = s.queue * 5 + a as u16;
            (s.len + 1 == k, None, s.len + 1, nq)
        } else {
            let ea = s.oldest();
            let rest = s.queue % pow5(k - 1);
            (false, Some(ea), k, rest * 5 + a as u16)
        };
        // The echo only replays once it exists.
        let echo_action = if echo.is_some() { echo_action } else { None };
        let (p, mut e) = level.step(s.player as usize, echo, a, spawn, echo_action)?;
        if rules == Rules::InSync {
            // In step, the echo always stands where you stood, so it can always go where you went.
            if let (Some(old), Some(ea)) = (echo, echo_action) {
                e = level.neighbor(old, ea);
            }
        }
        Some(State { player: p as u8, echo: e.map(|v| v as u8).unwrap_or(NONE), len: nlen, queue: nqueue })
    }
}

/// Which rules a search plays by.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Rules {
    Normal,
    /// The echo never appears.
    NoEcho,
    /// The echo walks through closed doors, so it never falls out of step.
    InSync,
}

/// Solve with the echo (normal rules). `limit` caps explored states.
pub fn solve(level: &Level, limit: usize) -> Option<Solution> {
    search(level, Rules::Normal, false, limit).ok().flatten()
}

/// Solve as if the echo never appears: used to prove a level actually needs the echo.
pub fn solve_without_echo(level: &Level, limit: usize) -> Option<Solution> {
    search(level, Rules::NoEcho, false, limit).ok().flatten()
}

/// The search explored `limit` states without settling the question.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct OutOfBudget;

/// Solve without ever letting the echo bump into anything (it never falls out
/// of step): used to prove every win of a level makes the echo bump.
/// `Ok(None)` means no such win exists at all.
pub fn solve_in_step(level: &Level, limit: usize) -> Result<Option<Solution>, OutOfBudget> {
    search(level, Rules::Normal, true, limit)
}

/// Solve as if closed doors never stopped the echo, so it always walks exactly
/// where you walked. `Ok(None)` proves every real win needs a door to stop the
/// echo on purpose: an echo that just kept following you can't win it. That is
/// more than every win bumping the echo (it can bump by accident, on a step
/// after you no longer need it), and implies [`solve_in_step`] finds no win too:
/// a win without any bump is also a win here.
pub fn solve_in_sync(level: &Level, limit: usize) -> Result<Option<Solution>, OutOfBudget> {
    search(level, Rules::InSync, false, limit)
}

fn search(level: &Level, rules: Rules, in_step: bool, limit: usize) -> Result<Option<Solution>, OutOfBudget> {
    let start = State { player: level.start as u8, echo: NONE, len: 0, queue: 0 };
    let mut parent: HashMap<State, (State, Action), Fast> = HashMap::with_capacity_and_hasher(1 << 14, Fast::default());
    let mut q = VecDeque::new();
    q.push_back(start);

    while let Some(s) = q.pop_front() {
        if s.player as usize == level.exit {
            // reconstruct
            let mut moves = Vec::new();
            let mut cur = s;
            while cur != start {
                let (p, a) = parent[&cur];
                moves.push(a.to_char());
                cur = p;
            }
            moves.reverse();
            return Ok(Some(Solution { moves: moves.into_iter().collect(), explored: parent.len() + 1 }));
        }
        if parent.len() > limit {
            return Err(OutOfBudget);
        }
        for a in Action::ALL {
            if let Some(ns) = s.next(level, a, rules) {
                if ns == start || (in_step && s.echo_bumps(ns)) {
                    continue;
                }
                if let std::collections::hash_map::Entry::Vacant(v) = parent.entry(ns) {
                    v.insert((s, a));
                    q.push_back(ns);
                }
            }
        }
    }
    Ok(None)
}

/// What to do next from a game in progress.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Hint {
    /// Take `action` next. `left` is the length of the shortest win from here.
    Move { action: Action, left: usize },
    /// No win is possible from here. Undoing `undo` moves reaches the last
    /// position (on this game's own history) that can still be won.
    Stuck { undo: usize },
    /// The game is already won.
    Won,
    /// The search ran out of its budget before it could tell.
    Unknown,
}

enum Outcome {
    Win { first: Action, len: usize },
    NoWin,
    OutOfBudget,
}

/// Shortest win from `root`, skipping states already known to be lost (`dead`).
/// If there is none, every state reached is added to `dead`. `budget` counts
/// states explored and is shared across calls.
fn search_from(level: &Level, root: State, dead: &mut HashSet<State, Fast>, budget: &mut usize) -> Outcome {
    // State -> first action taken from the root to reach it.
    let mut seen: HashMap<State, u8, Fast> = HashMap::with_capacity_and_hasher(1 << 16, Fast::default());
    seen.insert(root, NONE);
    let mut q: VecDeque<(State, u8, u16)> = VecDeque::new();
    q.push_back((root, NONE, 0));
    while let Some((s, first, depth)) = q.pop_front() {
        for a in Action::ALL {
            let Some(ns) = s.next(level, a, Rules::Normal) else { continue };
            let f = if first == NONE { a as u8 } else { first };
            if ns.player as usize == level.exit {
                return Outcome::Win { first: Action::from_u8(f).unwrap(), len: depth as usize + 1 };
            }
            if dead.contains(&ns) {
                continue;
            }
            if let std::collections::hash_map::Entry::Vacant(v) = seen.entry(ns) {
                if *budget == 0 {
                    return Outcome::OutOfBudget;
                }
                *budget -= 1;
                v.insert(f);
                q.push_back((ns, f, depth + 1));
            }
        }
    }
    dead.extend(seen.into_keys());
    Outcome::NoWin
}

/// The next move of a shortest win from wherever the player is now (not only
/// on the optimal path from the start). From a lost position, it walks back
/// through the player's own moves to the last one that can still be won.
/// Positions found lost are remembered, so walking back costs little more than
/// the one search. `limit` caps the states explored in total.
pub fn hint(game: &Game, limit: usize) -> Hint {
    if game.won() {
        return Hint::Won;
    }
    let mut budget = limit;
    let mut dead: HashSet<State, Fast> = HashSet::default();
    // The state after each prefix of the history, newest last.
    let mut replay = Game::new(game.level.clone());
    let mut states = vec![State::of(&replay)];
    for &a in &game.history {
        replay.try_step(a);
        states.push(State::of(&replay));
    }
    let n = game.history.len();
    for (i, &root) in states.iter().enumerate().rev() {
        if dead.contains(&root) {
            continue;
        }
        match search_from(&game.level, root, &mut dead, &mut budget) {
            Outcome::Win { first, len } if i == n => return Hint::Move { action: first, left: len },
            Outcome::Win { .. } => return Hint::Stuck { undo: n - i },
            Outcome::NoWin => {}
            Outcome::OutOfBudget => return Hint::Unknown,
        }
    }
    Hint::Unknown
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gen::Rng;

    #[test]
    fn solves_trivial_corridor() {
        let l = Level::parse(&["S..E"], 3).unwrap();
        let s = solve(&l, 100_000).unwrap();
        assert_eq!(s.moves, "RRR");
    }

    #[test]
    fn needs_echo_to_hold_far_plate() {
        // The plate is far from the door: only the echo can hold it while you pass.
        let l = Level::parse(&["S.A", "#.#", "#a#", "#E#"], 2).unwrap();
        assert!(solve_without_echo(&l, 100_000).is_none());
        let s = solve(&l, 100_000).expect("solvable with echo");
        assert!(Game::verify(&l, &s.moves), "solution {} must replay", s.moves);
    }

    #[test]
    fn in_step_solve_never_lets_the_echo_bump() {
        // Lesson 2 is won with the echo in step all the way.
        let l = Level::parse(&["S.A", "#.#", "#a#", "#E#"], 2).unwrap();
        let s = solve_in_step(&l, 100_000).unwrap().expect("a bump-free win");
        assert_eq!(s.moves.len(), solve(&l, 100_000).unwrap().moves.len());
        let mut g = Game::new(l.clone());
        for c in s.moves.chars() {
            assert!(g.try_step(Action::from_char(c).unwrap()));
        }
        assert!(g.won() && g.echo_blocked.iter().all(|b| !b));
        assert!(matches!(solve_in_step(&l, 3), Err(OutOfBudget)));
        assert_eq!(solve_in_step(&Level::parse(&["S#E"], 2).unwrap(), 100_000).map(|s| s.is_some()), Ok(false));
    }

    #[test]
    fn in_sync_solve_lets_the_echo_walk_through_closed_doors() {
        // Lesson 2 is won with the echo in step, so the in-sync rules win it just as fast.
        let l = Level::parse(&["S.A", "#.#", "#a#", "#E#"], 2).unwrap();
        let s = solve_in_sync(&l, 100_000).unwrap().expect("an in-sync win");
        assert_eq!(s.moves.len(), solve(&l, 100_000).unwrap().moves.len());
        assert!(matches!(solve_in_sync(&l, 3), Err(OutOfBudget)));
        // Here every win bumps the echo into door a, but only by accident: it
        // bumps on the very step you go through b, so an echo that never fell
        // out of step would have held B for you just the same.
        let accident = Level::parse(&["S.A", "#B#", "#a#", "#.#", "#b#", "#E#"], 2).unwrap();
        assert!(matches!(solve_in_step(&accident, 100_000), Ok(None)));
        assert!(solve_in_sync(&accident, 100_000).unwrap().is_some());
        // One more step between B and b: an echo in step has walked off B by
        // the time you get there, so it has to get stuck on B on purpose.
        let purpose = Level::parse(&["S.A", "#B#", "#a#", "#.#", "#.#", "#bE"], 2).unwrap();
        assert!(solve(&purpose, 100_000).is_some());
        assert!(matches!(solve_in_sync(&purpose, 100_000), Ok(None)));
    }

    /// Lesson 5 teaches the bump: it can't be won without the echo, every win
    /// needs the echo out of step, and the shortest win gets it there by
    /// bumping a closed door while it stands on a plate.
    #[test]
    fn lesson_5_needs_the_echo_to_bump_a_door_on_purpose() {
        let (rows, k) = read(&format!("{}/../levels/tutorial/5.json", env!("CARGO_MANIFEST_DIR")));
        let l = Level::parse(&rows.iter().map(String::as_str).collect::<Vec<_>>(), k).unwrap();
        let sol = solve(&l, 3_000_000).expect("solvable").moves;
        assert!(solve_without_echo(&l, 3_000_000).is_none(), "needs the echo");
        assert!(matches!(solve_in_step(&l, 3_000_000), Ok(None)), "a win where the echo never bumps exists");
        assert!(matches!(solve_in_sync(&l, 3_000_000), Ok(None)), "a win with the echo in step exists");
        // Replay: the echo's first bump is into a closed door, and while it is
        // out of step it holds a plate for you to go through that plate's door.
        let mut g = Game::new(l.clone());
        let (mut first_bump, mut held_out_of_step) = (None, false);
        for c in sol.chars() {
            let (p, e) = (g.player, g.echo);
            let echo_action = e.map(|_| g.history[g.history.len() - k]);
            assert!(g.try_step(Action::from_char(c).unwrap()));
            if first_bump.is_none() && *g.echo_blocked.last().unwrap() {
                first_bump = l.neighbor(e.unwrap(), echo_action.unwrap()).map(|t| l.tiles[t]);
            }
            if let (crate::Tile::Door(d), Some(e)) = (l.tiles[g.player], e) {
                let synced = g.history.len() > k && Some(e) == replayed(&l, &g.history[..g.history.len() - 1 - k]);
                held_out_of_step |= g.player != p && first_bump.is_some() && !synced && l.tiles[e] == crate::Tile::Plate(d);
            }
        }
        assert!(g.won());
        assert!(matches!(first_bump, Some(crate::Tile::Door(_))), "first bump into {first_bump:?}");
        assert!(held_out_of_step, "{sol}: the echo never holds a plate while out of step");
    }

    /// Where you stood after `moves` from the start.
    fn replayed(l: &Level, moves: &[Action]) -> Option<usize> {
        let mut g = Game::new(l.clone());
        moves.iter().all(|&a| g.try_step(a)).then_some(g.player)
    }

    #[test]
    fn unsolvable_returns_none() {
        let l = Level::parse(&["S#E"], 2).unwrap();
        assert!(solve(&l, 100_000).is_none());
    }

    #[test]
    fn hint_from_start_matches_solver_length() {
        let l = Level::parse(&["S.A", "#.#", "#a#", "#E#"], 2).unwrap();
        let sol = solve(&l, 100_000).unwrap();
        match hint(&Game::new(l), 100_000) {
            Hint::Move { left, .. } => assert_eq!(left, sol.moves.len()),
            other => panic!("expected a move, got {other:?}"),
        }
    }

    #[test]
    fn hint_after_a_win_is_won() {
        let l = Level::parse(&["S.E"], 2).unwrap();
        let mut g = Game::new(l);
        g.try_step(Action::Right);
        g.try_step(Action::Right);
        assert_eq!(hint(&g, 1000), Hint::Won);
    }

    #[test]
    fn hint_gives_up_within_its_budget() {
        let l = Level::parse(&["S.A", "#.#", "#a#", "#E#"], 2).unwrap();
        assert_eq!(hint(&Game::new(l), 3), Hint::Unknown);
    }

    /// Random play on the test levels runs into lost positions (say, the echo
    /// shut behind a door it was meant to hold). From each one, the hint's undo
    /// lands exactly on the last position that can still be won.
    #[test]
    fn stuck_offers_undo_to_the_last_winnable_position() {
        for (rows, k) in levels() {
            let l = Level::parse(&rows.iter().map(String::as_str).collect::<Vec<_>>(), k).unwrap();
            let mut rng = Rng::from_str(&rows.concat());
            let mut found = 0;
            for _ in 0..400 {
                let g = random_walk(&l, &mut rng, 30);
                if let Hint::Stuck { undo } = hint(&g, 3_000_000) {
                    assert!(undo >= 1 && undo <= g.history.len());
                    let mut back = g.clone();
                    for _ in 0..undo {
                        back.undo();
                    }
                    assert!(matches!(hint(&back, 3_000_000), Hint::Move { .. }), "undo {undo} should land on a winnable position");
                    // And it is the *last* winnable one: one move later is lost.
                    let mut later = g.clone();
                    for _ in 0..undo - 1 {
                        later.undo();
                    }
                    assert!(matches!(hint(&later, 3_000_000), Hint::Stuck { undo: 1 }));
                    found += 1;
                    if found == 3 {
                        break;
                    }
                }
            }
            if found > 0 {
                return;
            }
        }
        panic!("no lost position found by random play on any test level");
    }

    /// Following hints from positions off the optimal path always wins, in
    /// exactly as many moves as the first hint promised.
    #[test]
    fn hints_lead_to_a_win_from_off_path_positions() {
        for (rows, k) in levels() {
            let l = Level::parse(&rows.iter().map(String::as_str).collect::<Vec<_>>(), k).unwrap();
            let sol = solve(&l, 3_000_000).unwrap().moves;
            let mut rng = Rng::from_str(&rows.concat());
            let mut checked = 0;
            for _ in 0..200 {
                let mut g = random_walk(&l, &mut rng, 14);
                let hist: String = g.history.iter().map(|a| a.to_char()).collect();
                if sol.starts_with(&hist) {
                    continue; // on the optimal path: not what this test is about
                }
                let Hint::Move { mut left, .. } = hint(&g, 3_000_000) else { continue };
                while let Hint::Move { action, left: now } = hint(&g, 3_000_000) {
                    assert_eq!(now, left, "each hint should bring the win one move closer");
                    assert!(g.try_step(action), "hinted move {action:?} must be legal");
                    left -= 1;
                }
                assert!(g.won(), "following hints from {hist} should win");
                assert_eq!(left, 0);
                checked += 1;
                if checked == 4 {
                    break;
                }
            }
            assert!(checked >= 3, "only {checked} off-path winnable positions checked");
        }
    }


    /// Lesson 4, today's daily (2026-11-13) and the hardest dailies in
    /// `levels/`: 2026-11-21 explores the most states, 2026-11-29 has the longest par.
    fn levels() -> Vec<(Vec<String>, usize)> {
        let mut out = vec![(["S.B", "#A#", "#a#", "#.#", "#b#", "#E#"].map(String::from).to_vec(), 4)];
        for date in ["2026-11-13", "2026-11-21", "2026-11-29"] {
            out.push(daily(date));
        }
        out
    }

    fn daily(date: &str) -> (Vec<String>, usize) {
        read(&format!("{}/../levels/daily/{date}.json", env!("CARGO_MANIFEST_DIR")))
    }

    fn read(path: &str) -> (Vec<String>, usize) {
        let text = std::fs::read_to_string(path).unwrap_or_else(|e| panic!("{path}: {e}"));
        // Tiny reader for the two fields we need, so tests don't need serde.
        let after = |key: &str| &text[text.find(key).unwrap() + key.len()..];
        let delay: usize = after("\"delay\":").trim_start().split(|c: char| !c.is_ascii_digit()).next().unwrap().parse().unwrap();
        let grid = after("\"grid\":");
        let grid = &grid[grid.find('[').unwrap() + 1..grid.find(']').unwrap()];
        let rows = grid.split(',').map(|r| r.trim().trim_matches('"').to_string()).collect();
        (rows, delay)
    }

    /// Up to `max` random legal moves from the start, stopping short of a win.
    fn random_walk(l: &Level, rng: &mut Rng, max: usize) -> Game {
        let mut g = Game::new(l.clone());
        let n = rng.range(3, max);
        while g.history.len() < n {
            let a = Action::ALL[rng.below(5)];
            let mut t = g.clone();
            if t.try_step(a) && !t.won() {
                g = t;
            }
        }
        g
    }
}
