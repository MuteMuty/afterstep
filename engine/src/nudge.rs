//! The first Hint press on a puzzle gives a nudge about its idea instead of a
//! move. The nudge is read off the solver's shortest solution: which plates the
//! echo holds while you go through their doors, which you hold yourself, and
//! whether the echo has to bump into something on purpose (proven by finding no
//! win at all where the echo never bumps). New puzzles get a nudge for free.

use crate::solver::{solve, solve_in_step};
use crate::{Action, Game, Level, Tile};

/// What the echo bumps into when it falls out of step.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Obstacle {
    Door,
    Wall,
    Edge,
}

/// The idea of a puzzle, as read off its shortest solution.
#[derive(Clone, Debug, PartialEq, Eq, Default)]
pub struct Nudge {
    /// Plate letters (0 = A) the echo stands on while you step through their
    /// doors, in the order it first does so.
    pub echo_holds: Vec<u8>,
    /// Plate letters you stand on yourself while stepping through their doors.
    pub you_hold: Vec<u8>,
    /// The echo's first bump, when no win exists without one, and whether it
    /// comes before the echo's first hold.
    pub bump: Option<(Obstacle, bool)>,
}

impl Nudge {
    /// Nothing specific could be read off the solution.
    pub fn is_generic(&self) -> bool {
        self.echo_holds.is_empty() && self.you_hold.is_empty() && self.bump.is_none()
    }

    /// One short sentence, plain and in sentence case.
    pub fn text(&self) -> String {
        let plates = |ls: &[u8], word: bool| {
            let names: Vec<String> = ls.iter().map(|&l| ((b'A' + l) as char).to_string()).collect();
            let list = match names.split_last() {
                Some((last, [])) => last.clone(),
                Some((last, rest)) => format!("{} and {last}", rest.join(", ")),
                None => String::new(),
            };
            match (word, ls.len()) {
                (false, _) => list,
                (true, 1) => format!("plate {list}"),
                (true, _) => format!("plates {list}"),
            }
        };
        let bump = |o: Obstacle| match o {
            Obstacle::Door => "bump a door",
            Obstacle::Wall => "bump a wall",
            Obstacle::Edge => "bump the edge",
        };
        match (&self.echo_holds[..], self.bump) {
            ([], Some((o, _))) => format!("Make your echo {} on purpose.", bump(o)),
            // Bump and hold in one line: only the first plate, so it stays short.
            (h, Some((o, true))) => format!("Make your echo {}, then hold {}.", bump(o), plates(&h[..1], false)),
            (h, Some((o, false))) => format!("Let your echo hold {}, then {}.", plates(&h[..1], false), bump(o)),
            ([_], None) => format!("Let your echo hold {} for you.", plates(&self.echo_holds, true)),
            (h @ [_, ..], None) => format!("Let your echo hold {}.", plates(h, true)),
            ([], None) => match self.you_hold.len() {
                0 => "Think ahead to where your echo will stand.".to_string(),
                1 => format!("Stand on {} to open its door.", plates(&self.you_hold, true)),
                _ => format!("Stand on {} to open their doors.", plates(&self.you_hold, true)),
            },
        }
    }
}

/// The nudge for a level, from its shortest solution. `limit` caps the states
/// each search may explore; if the level can't be solved within it, the nudge
/// is the generic one.
pub fn nudge(level: &Level, limit: usize) -> Nudge {
    let Some(sol) = solve(level, limit) else { return Nudge::default() };
    // Only worth a second search if the shortest win bumps the echo at all.
    let bumps = read(level, &sol.moves, true).bump.is_some();
    // Out of budget proves nothing, so then the bump isn't mentioned.
    read(level, &sol.moves, bumps && matches!(solve_in_step(level, limit), Ok(None)))
}

/// Read the nudge off a known winning move string (e.g. "RRD.U"). `bump_needed`
/// says whether every win makes the echo bump into something.
pub fn read(level: &Level, moves: &str, bump_needed: bool) -> Nudge {
    let mut n = Nudge::default();
    let mut g = Game::new(level.clone());
    let add = |v: &mut Vec<u8>, l: u8| {
        if !v.contains(&l) {
            v.push(l)
        }
    };
    for a in moves.chars().filter_map(Action::from_char) {
        let (p, e) = (g.player, g.echo);
        let echo_action = e.map(|_| g.history[g.history.len() - level.delay]);
        if !g.try_step(a) {
            break;
        }
        // Stepping into a door: whose plate held it open?
        if let Tile::Door(d) = level.tiles[g.player] {
            if g.player != p {
                if level.tiles[p] == Tile::Plate(d) {
                    add(&mut n.you_hold, d);
                } else if e.map(|e| level.tiles[e]) == Some(Tile::Plate(d)) {
                    add(&mut n.echo_holds, d);
                }
            }
        }
        if bump_needed && n.bump.is_none() && *g.echo_blocked.last().unwrap() {
            let (e, ea) = (e.unwrap(), echo_action.unwrap());
            let o = match level.neighbor(e, ea).map(|t| level.tiles[t]) {
                None => Obstacle::Edge,
                Some(Tile::Door(_)) => Obstacle::Door,
                Some(_) => Obstacle::Wall,
            };
            n.bump = Some((o, n.echo_holds.is_empty()));
        }
    }
    n
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lvl(rows: &[&str], k: usize) -> Level {
        Level::parse(rows, k).unwrap()
    }

    const A: u8 = 0;
    const B: u8 = 1;

    #[test]
    fn echo_holding_the_plate_for_you() {
        // Lesson 2: the plate is off to the side, only the echo can hold it.
        let n = nudge(&lvl(&["S.A", "#.#", "#a#", "#E#"], 2), 100_000);
        assert_eq!(n, Nudge { echo_holds: vec![A], ..Nudge::default() });
        assert_eq!(n.text(), "Let your echo hold plate A for you.");
    }

    #[test]
    fn holding_a_plate_yourself() {
        // Lesson 1: no echo in time, you stand on the plate and step through.
        let n = nudge(&lvl(&["S.Aa.E"], 6), 100_000);
        assert_eq!(n, Nudge { you_hold: vec![A], ..Nudge::default() });
        assert_eq!(n.text(), "Stand on plate A to open its door.");
    }

    #[test]
    fn the_echo_hold_is_the_idea_when_you_hold_one_too() {
        // Lesson 4: you hold A yourself, the echo holds B.
        let n = nudge(&lvl(&["S.B", "#A#", "#a#", "#.#", "#b#", "#E#"], 4), 100_000);
        assert_eq!(n.echo_holds, vec![B]);
        assert_eq!(n.you_hold, vec![A]);
        assert_eq!(n.text(), "Let your echo hold plate B for you.");
    }

    #[test]
    fn nothing_to_say_gives_a_true_generic_sentence() {
        let n = nudge(&lvl(&["S..E"], 2), 100_000);
        assert!(n.is_generic());
        assert_eq!(n.text(), "Think ahead to where your echo will stand.");
        // Unsolvable within the budget: still something true to say.
        assert!(nudge(&lvl(&["S#E"], 2), 100_000).is_generic());
    }

    #[test]
    fn a_bump_is_only_mentioned_when_every_win_needs_one() {
        // Daily 2026-11-13 (stored solution LLLRRUUUD.R.RDRD): no win keeps the
        // echo in step, and the echo holds B before it first bumps a door.
        let (rows, k) = read_level(&format!("{}/../levels/daily/2026-11-13.json", env!("CARGO_MANIFEST_DIR")));
        let l = lvl(&rows.iter().map(String::as_str).collect::<Vec<_>>(), k);
        assert!(matches!(solve_in_step(&l, 3_000_000), Ok(None)));
        let n = nudge(&l, 3_000_000);
        assert_eq!(n.bump, Some((Obstacle::Door, false)));
        assert_eq!(n.echo_holds[0], B);
        assert_eq!(read(&l, "LLLRRUUUD.R.RDRD", true).bump, Some((Obstacle::Door, false)));
        // The same solution read as if a bump-free win existed says nothing about bumps.
        assert_eq!(read(&l, "LLLRRUUUD.R.RDRD", false).bump, None);
        // With too small a budget nothing can be read off, so the nudge is generic.
        assert!(nudge(&l, 2_000).is_generic());
    }

    #[test]
    fn texts_for_every_shape() {
        let t = |echo_holds: Vec<u8>, you_hold: Vec<u8>, bump| Nudge { echo_holds, you_hold, bump }.text();
        assert_eq!(t(vec![A, B], vec![], None), "Let your echo hold plates A and B.");
        assert_eq!(t(vec![0, 1, 2], vec![], None), "Let your echo hold plates A, B and C.");
        assert_eq!(t(vec![], vec![A, B], None), "Stand on plates A and B to open their doors.");
        assert_eq!(t(vec![], vec![], Some((Obstacle::Door, true))), "Make your echo bump a door on purpose.");
        assert_eq!(t(vec![], vec![A], Some((Obstacle::Wall, true))), "Make your echo bump a wall on purpose.");
        assert_eq!(t(vec![], vec![], Some((Obstacle::Edge, true))), "Make your echo bump the edge on purpose.");
        assert_eq!(t(vec![B], vec![], Some((Obstacle::Door, false))), "Let your echo hold B, then bump a door.");
        assert_eq!(t(vec![B], vec![], Some((Obstacle::Door, true))), "Make your echo bump a door, then hold B.");
        assert_eq!(t(vec![A, B], vec![], Some((Obstacle::Wall, false))), "Let your echo hold A, then bump a wall.");
        assert_eq!(t(vec![B, A], vec![], Some((Obstacle::Door, true))), "Make your echo bump a door, then hold B.");
    }

    /// Every lesson and daily in `levels/` gets a short nudge that matches its
    /// shortest solution, checked by replaying that solution independently.
    #[test]
    fn every_level_gets_a_nudge_that_matches_its_solution() {
        let root = format!("{}/../levels", env!("CARGO_MANIFEST_DIR"));
        let mut files: Vec<String> = Vec::new();
        for dir in ["tutorial", "daily"] {
            let mut names: Vec<_> = std::fs::read_dir(format!("{root}/{dir}"))
                .unwrap()
                .map(|e| e.unwrap().path().display().to_string())
                .filter(|p| p.ends_with(".json"))
                .collect();
            names.sort();
            files.extend(names);
        }
        assert!(files.len() >= 5, "levels not found under {root}");
        let (mut generic, mut bumps) = (Vec::new(), 0);
        for f in &files {
            let (rows, k) = read_level(f);
            let l = lvl(&rows.iter().map(String::as_str).collect::<Vec<_>>(), k);
            let sol = solve(&l, 3_000_000).unwrap_or_else(|| panic!("{f}: no solution")).moves;
            let n = nudge(&l, 3_000_000);
            let text = n.text();
            let name = f.rsplit('/').next().unwrap();
            println!("{name}: {text}");
            assert!(!text.is_empty() && text.ends_with('.'), "{f}: {text:?}");
            // Fits on one line of a 390px phone.
            assert!(text.chars().count() <= 44, "{f}: nudge too long: {text:?}");
            assert_eq!(text.chars().next().map(char::is_uppercase), Some(true), "{f}: sentence case");

            // Replay the solution and record, independently, who holds what.
            let mut g = Game::new(l.clone());
            let (mut echo_holds, mut you_hold, mut blocked) = (Vec::new(), Vec::new(), false);
            for c in sol.chars() {
                let a = Action::from_char(c).unwrap();
                let (p, e) = (g.player, g.echo);
                assert!(g.try_step(a));
                blocked |= *g.echo_blocked.last().unwrap();
                if let Tile::Door(d) = l.tiles[g.player] {
                    if g.player != p {
                        if l.tiles[p] == Tile::Plate(d) {
                            you_hold.push(d);
                        } else if e.map(|e| l.tiles[e]) == Some(Tile::Plate(d)) {
                            echo_holds.push(d);
                        }
                    }
                }
            }
            for d in &n.echo_holds {
                assert!(echo_holds.contains(d), "{f}: says the echo holds {d} but {sol} doesn't");
            }
            for d in &n.you_hold {
                assert!(you_hold.contains(d), "{f}: says you hold {d} but {sol} doesn't");
            }
            if !echo_holds.is_empty() {
                assert!(!n.echo_holds.is_empty(), "{f}: the echo holds {echo_holds:?} in {sol}, nudge misses it");
            }
            if n.bump.is_some() {
                bumps += 1;
                assert!(blocked, "{f}: says the echo bumps but {sol} never blocks it");
                assert!(matches!(solve_in_step(&l, 3_000_000), Ok(None)), "{f}: says a bump is needed but a bump-free win exists");
            }
            if n.is_generic() {
                generic.push(name.to_string());
            }
        }
        println!("nudges: {} levels, {} with a bump, {} generic {:?}", files.len(), bumps, generic.len(), generic);
        assert!(generic.len() * 5 <= files.len(), "too many generic nudges: {generic:?}");
    }

    /// Tiny reader for `delay` and `grid`, so tests don't need serde.
    fn read_level(path: &str) -> (Vec<String>, usize) {
        let text = std::fs::read_to_string(path).unwrap_or_else(|e| panic!("{path}: {e}"));
        let after = |key: &str| &text[text.find(key).unwrap() + key.len()..];
        let delay: usize = after("\"delay\":").trim_start().split(|c: char| !c.is_ascii_digit()).next().unwrap().parse().unwrap();
        let grid = after("\"grid\":");
        let grid = &grid[grid.find('[').unwrap() + 1..grid.find(']').unwrap()];
        (grid.split(',').map(|r| r.trim().trim_matches('"').to_string()).collect(), delay)
    }
}
