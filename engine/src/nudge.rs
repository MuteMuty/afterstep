//! The first Hint press on a puzzle gives a nudge about its idea instead of a
//! move. The nudge is read off the solver's shortest solution: which plates the
//! echo holds while you go through their doors, which you hold yourself, and,
//! when no win at all keeps the echo in step, what stops it first and why that
//! helps. New puzzles get a nudge for free.
//!
//! Plates and doors are always named in full ("plate B", "door B"), and a stop
//! is said in the lessons' words: a closed door stops your echo.

use crate::solver::{solve, solve_in_step};
use crate::{Action, Game, Level, Tile};

/// The longest nudge, in characters: one line of the status row on a 320px
/// phone, with room to spare for wider fonts (the playtest measures each one).
pub const MAX_LEN: usize = 44;

/// What stops the echo when it falls out of step.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Obstacle {
    /// A closed door (letter 0 = A). The first stop is always one: the echo
    /// follows your steps, and a door you went through can be closed by the
    /// time it gets there.
    Door(u8),
    Wall,
    Edge,
}

/// The echo's first stop, when every win needs one.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Bump {
    /// What it walks into.
    pub into: Obstacle,
    /// The plate it stands on while stopped, if any.
    pub on: Option<u8>,
    /// The first plate it holds for you from the stop on, if any.
    pub then_holds: Option<u8>,
}

/// The idea of a puzzle, as read off its shortest solution.
#[derive(Clone, Debug, PartialEq, Eq, Default)]
pub struct Nudge {
    /// Plate letters (0 = A) the echo stands on while you step through their
    /// doors, in the order it first does so.
    pub echo_holds: Vec<u8>,
    /// Plate letters you stand on yourself while stepping through their doors.
    pub you_hold: Vec<u8>,
    /// The echo's first stop, when no win exists without one.
    pub bump: Option<Bump>,
}

fn letter(l: u8) -> char {
    (b'A' + l) as char
}

/// "plate A", "plates A and B", "plates A, B and C".
fn plates(ls: &[u8]) -> String {
    let names: Vec<String> = ls.iter().map(|&l| letter(l).to_string()).collect();
    match names.split_last() {
        Some((last, [])) => format!("plate {last}"),
        Some((last, rest)) => format!("plates {} and {last}", rest.join(", ")),
        None => String::new(),
    }
}

impl Nudge {
    /// Nothing specific could be read off the solution.
    pub fn is_generic(&self) -> bool {
        self.echo_holds.is_empty() && self.you_hold.is_empty() && self.bump.is_none()
    }

    /// One short sentence, plain and in sentence case: the most specific one
    /// that fits in `MAX_LEN` characters.
    pub fn text(&self) -> String {
        let mut says: Vec<String> = Vec::new();
        if let Some(b) = self.bump {
            let what = match b.into {
                Obstacle::Door(d) => format!("Door {}", letter(d)),
                Obstacle::Wall => "A wall".to_string(),
                Obstacle::Edge => "The edge".to_string(),
            };
            match (b.on, b.then_holds) {
                // It stays on the plate, so it keeps holding that door open.
                (Some(p), Some(h)) if p == h => says.push(format!("{what} keeps your echo on {} for you.", plates(&[p]))),
                // Out of step, it is on a plate when you next need one.
                (_, Some(h)) => says.push(format!("{what} stops your echo, so it holds {}.", plates(&[h]))),
                _ => {}
            }
            says.push(match b.into {
                Obstacle::Door(d) => format!("Door {} lets you pass but stops your echo.", letter(d)),
                Obstacle::Wall => "Let a wall stop your echo on purpose.".to_string(),
                Obstacle::Edge => "Let the edge stop your echo on purpose.".to_string(),
            });
        } else {
            let (echo, you) = (&self.echo_holds[..], &self.you_hold[..]);
            if !echo.is_empty() && !you.is_empty() {
                says.push(format!("You hold {}, your echo holds {}.", plates(you), plates(echo)));
            }
            match (echo, you) {
                ([_], _) => says.push(format!("Let your echo hold {} for you.", plates(echo))),
                ([_, ..], _) => says.push(format!("Let your echo hold {}.", plates(echo))),
                ([], [d]) => says.push(format!("Stand on {} to open door {}.", plates(you), letter(*d))),
                ([], [_, ..]) => {
                    says.push(format!("Stand on {} to open their doors.", plates(you)));
                    says.push(format!("Stand on {} yourself.", plates(you)));
                }
                ([], []) => {}
            }
        }
        says.push("Think ahead to where your echo will stand.".to_string());
        says.into_iter().find(|s| s.chars().count() <= MAX_LEN).unwrap()
    }
}

/// The nudge for a level, from its shortest solution. `limit` caps the states
/// each search may explore; if the level can't be solved within it, the nudge
/// is the generic one.
pub fn nudge(level: &Level, limit: usize) -> Nudge {
    let Some(sol) = solve(level, limit) else { return Nudge::default() };
    // Only worth a second search if the shortest win stops the echo at all.
    let bumps = read(level, &sol.moves, true).bump.is_some();
    // Out of budget proves nothing, so then the stop isn't mentioned.
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
        // The echo's first stop: what it walked into and what it stands on.
        if bump_needed && n.bump.is_none() && *g.echo_blocked.last().unwrap() {
            let (e, ea) = (e.unwrap(), echo_action.unwrap());
            let into = match level.neighbor(e, ea).map(|t| level.tiles[t]) {
                None => Obstacle::Edge,
                Some(Tile::Door(d)) => Obstacle::Door(d),
                Some(_) => Obstacle::Wall,
            };
            let on = match level.tiles[e] {
                Tile::Plate(l) => Some(l),
                _ => None,
            };
            n.bump = Some(Bump { into, on, then_holds: None });
        }
        // Stepping into a door: whose plate held it open?
        if let Tile::Door(d) = level.tiles[g.player] {
            if g.player != p {
                if level.tiles[p] == Tile::Plate(d) {
                    add(&mut n.you_hold, d);
                } else if e.map(|e| level.tiles[e]) == Some(Tile::Plate(d)) {
                    add(&mut n.echo_holds, d);
                    if let Some(b) = n.bump.as_mut() {
                        b.then_holds.get_or_insert(d);
                    }
                }
            }
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
        assert_eq!(n.text(), "Stand on plate A to open door A.");
    }

    #[test]
    fn you_hold_one_plate_and_the_echo_another() {
        // Lesson 4: you hold A yourself, the echo holds B.
        let n = nudge(&lvl(&["S.B", "#A#", "#a#", "#.#", "#b#", "#E#"], 4), 100_000);
        assert_eq!(n.echo_holds, vec![B]);
        assert_eq!(n.you_hold, vec![A]);
        assert_eq!(n.text(), "You hold plate A, your echo holds plate B.");
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
    fn a_door_that_keeps_the_echo_on_its_plate() {
        // Lesson 5: you go through door A off plate A; 2 moves later the echo
        // follows from plate B, door A is closed by then, so it stays on B
        // while you go through door B.
        let n = nudge(&lvl(&["S.A", "#B#", "#a#", "#.#", "#.#", "#bE"], 2), 100_000);
        assert_eq!(n.bump, Some(Bump { into: Obstacle::Door(A), on: Some(B), then_holds: Some(B) }));
        assert_eq!(n.text(), "Door A keeps your echo on plate B for you.");
    }

    #[test]
    fn a_bump_is_only_mentioned_when_every_win_needs_one() {
        // Daily 2026-11-13 (stored solution LLLRRUUUD.R.RDRD): no win keeps the
        // echo in step. The echo holds B, then stands on A for you when it
        // tries to follow you into door B, closed by then.
        let (rows, k) = read_level(&format!("{}/../levels/daily/2026-11-13.json", env!("CARGO_MANIFEST_DIR")));
        let l = lvl(&rows.iter().map(String::as_str).collect::<Vec<_>>(), k);
        assert!(matches!(solve_in_step(&l, 3_000_000), Ok(None)));
        let n = nudge(&l, 3_000_000);
        let stop = Bump { into: Obstacle::Door(B), on: Some(A), then_holds: Some(A) };
        assert_eq!(n.bump, Some(stop));
        assert_eq!(n.echo_holds, vec![B, A]);
        assert_eq!(n.text(), "Door B keeps your echo on plate A for you.");
        assert_eq!(read(&l, "LLLRRUUUD.R.RDRD", true).bump, Some(stop));
        // The same solution read as if a bump-free win existed says nothing about bumps.
        assert_eq!(read(&l, "LLLRRUUUD.R.RDRD", false).bump, None);
        // With too small a budget nothing can be read off, so the nudge is generic.
        assert!(nudge(&l, 2_000).is_generic());
    }

    #[test]
    fn a_door_that_stops_the_echo_before_it_holds_a_plate() {
        // Daily 2026-12-04 (DDUUDLDRRRULRDLLLLLU): the echo holds B, follows you
        // into door B once it's closed and stops off any plate; out of step, it
        // then holds A for you.
        let (rows, k) = read_level(&format!("{}/../levels/daily/2026-12-04.json", env!("CARGO_MANIFEST_DIR")));
        let l = lvl(&rows.iter().map(String::as_str).collect::<Vec<_>>(), k);
        let n = read(&l, "DDUUDLDRRRULRDLLLLLU", true);
        assert_eq!(n.bump, Some(Bump { into: Obstacle::Door(B), on: None, then_holds: Some(A) }));
        assert_eq!(n.text(), "Door B stops your echo, so it holds plate A.");
    }

    #[test]
    fn texts_for_every_shape() {
        let t = |echo_holds: Vec<u8>, you_hold: Vec<u8>, bump| Nudge { echo_holds, you_hold, bump }.text();
        let stop = |into, on, then_holds| Some(Bump { into, on, then_holds });
        const C: u8 = 2;
        // Who holds what.
        assert_eq!(t(vec![A, B], vec![], None), "Let your echo hold plates A and B.");
        assert_eq!(t(vec![A, B, C], vec![], None), "Let your echo hold plates A, B and C.");
        assert_eq!(t(vec![B], vec![A], None), "You hold plate A, your echo holds plate B.");
        // Too long for one line on a phone: the echo's part is the idea.
        assert_eq!(t(vec![B, C], vec![A], None), "Let your echo hold plates B and C.");
        assert_eq!(t(vec![], vec![A, B], None), "Stand on plates A and B to open their doors.");
        assert_eq!(t(vec![], vec![A, B, C], None), "Stand on plates A, B and C yourself.");
        // The echo stopped on a plate it then holds for you.
        assert_eq!(t(vec![A], vec![], stop(Obstacle::Door(B), Some(A), Some(A))), "Door B keeps your echo on plate A for you.");
        assert_eq!(t(vec![C], vec![], stop(Obstacle::Wall, Some(C), Some(C))), "A wall keeps your echo on plate C for you.");
        assert_eq!(t(vec![C], vec![], stop(Obstacle::Edge, Some(C), Some(C))), "The edge keeps your echo on plate C for you.");
        // Stopped off a plate (or on one it doesn't hold for you), then it holds another.
        assert_eq!(t(vec![B, A], vec![], stop(Obstacle::Door(B), None, Some(A))), "Door B stops your echo, so it holds plate A.");
        assert_eq!(t(vec![B, C], vec![], stop(Obstacle::Door(C), Some(B), Some(C))), "Door C stops your echo, so it holds plate C.");
        assert_eq!(t(vec![A], vec![], stop(Obstacle::Wall, None, Some(A))), "A wall stops your echo, so it holds plate A.");
        // Stopped, and nothing held after: what the door does.
        assert_eq!(t(vec![B], vec![], stop(Obstacle::Door(B), None, None)), "Door B lets you pass but stops your echo.");
        assert_eq!(t(vec![], vec![], stop(Obstacle::Door(A), None, None)), "Door A lets you pass but stops your echo.");
        assert_eq!(t(vec![], vec![A], stop(Obstacle::Wall, None, None)), "Let a wall stop your echo on purpose.");
        assert_eq!(t(vec![], vec![], stop(Obstacle::Edge, None, None)), "Let the edge stop your echo on purpose.");
        // Every shape, with any letters, fits one line on a 320px phone.
        let all = (0..8u8).flat_map(|x| {
            let o = [Obstacle::Door(x), Obstacle::Wall, Obstacle::Edge];
            o.into_iter().flat_map(move |o| [stop(o, Some(x), Some(x)), stop(o, None, Some(x)), stop(o, None, None), None])
        });
        for b in all {
            for (e, y) in [(vec![], vec![]), (vec![7], vec![]), (vec![5, 6, 7], vec![]), (vec![7], vec![6]), (vec![], vec![5, 6, 7]), (vec![4, 5, 6, 7], vec![3])] {
                let s = t(e.clone(), y.clone(), b);
                assert!(s.chars().count() <= MAX_LEN, "{s:?} is over {MAX_LEN} characters");
                assert!(!s.contains(" bump") && !s.contains(" hold B") && s.ends_with('.'), "{s:?}");
            }
        }
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
        let (mut sentences, mut daily_sentences) = (std::collections::BTreeSet::new(), std::collections::BTreeSet::new());
        for f in &files {
            let (rows, k) = read_level(f);
            let l = lvl(&rows.iter().map(String::as_str).collect::<Vec<_>>(), k);
            let sol = solve(&l, 3_000_000).unwrap_or_else(|| panic!("{f}: no solution")).moves;
            let n = nudge(&l, 3_000_000);
            let text = n.text();
            let name = f.rsplit('/').next().unwrap();
            println!("{name}: {text}");
            assert!(!text.is_empty() && text.ends_with('.'), "{f}: {text:?}");
            // Fits on one line of a 320px phone (the playtest measures it there).
            assert!(text.chars().count() <= MAX_LEN, "{f}: nudge too long: {text:?}");
            sentences.insert(text.clone());
            if f.contains("/daily/") {
                daily_sentences.insert(text.clone());
            }
            assert_eq!(text.chars().next().map(char::is_uppercase), Some(true), "{f}: sentence case");

            // Replay the solution and record, independently, who holds what.
            let mut g = Game::new(l.clone());
            // Also where the echo first gets stopped: the tile it tried to enter,
            // the tile it stayed on, and every plate it holds for you from then on.
            let (mut echo_holds, mut you_hold, mut blocked) = (Vec::new(), Vec::new(), false);
            let (mut first_stop, mut held_after) = (None, Vec::new());
            for (i, c) in sol.chars().enumerate() {
                let a = Action::from_char(c).unwrap();
                let (p, e) = (g.player, g.echo);
                assert!(g.try_step(a));
                if *g.echo_blocked.last().unwrap() && !blocked {
                    let e = e.unwrap();
                    let tried = l.neighbor(e, g.history[i - k]).map(|t| l.tiles[t]);
                    first_stop = Some((tried, l.tiles[e]));
                }
                blocked |= *g.echo_blocked.last().unwrap();
                if let Tile::Door(d) = l.tiles[g.player] {
                    if g.player != p {
                        if l.tiles[p] == Tile::Plate(d) {
                            you_hold.push(d);
                        } else if e.map(|e| l.tiles[e]) == Some(Tile::Plate(d)) {
                            echo_holds.push(d);
                            if blocked {
                                held_after.push(d);
                            }
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
            if let Some(b) = n.bump {
                bumps += 1;
                assert!(blocked, "{f}: says the echo bumps but {sol} never blocks it");
                let (tried, stood) = first_stop.unwrap();
                let into = match tried {
                    None => Obstacle::Edge,
                    Some(Tile::Door(d)) => Obstacle::Door(d),
                    Some(_) => Obstacle::Wall,
                };
                assert_eq!(b.into, into, "{f}: names the wrong thing that stops the echo in {sol}");
                if let Some(p) = b.on {
                    assert_eq!(stood, Tile::Plate(p), "{f}: says the echo stops on plate {p} in {sol}");
                }
                assert_eq!(b.then_holds, held_after.first().copied(), "{f}: the plate the echo holds after it stops, in {sol}");
                assert!(matches!(solve_in_step(&l, 3_000_000), Ok(None)), "{f}: says a bump is needed but a bump-free win exists");
            }
            if n.is_generic() {
                generic.push(name.to_string());
            }
        }
        println!("nudges: {} levels, {} with a bump, {} generic {:?}", files.len(), bumps, generic.len(), generic);
        // Before lab#29 the 30 levels used 6 sentences, the 25 dailies 3
        // (17 of them "Let your echo hold B, then bump a door.").
        println!("distinct nudges: {} across {} levels (6 before), {} across the dailies (3 before)", sentences.len(), files.len(), daily_sentences.len());
        assert!(sentences.len() > 6 && daily_sentences.len() > 3, "nudges should be more specific than before lab#29: {sentences:?}");
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
