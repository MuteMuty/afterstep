//! Breadth-first solver. Finds the shortest winning action sequence.
//!
//! State = (player, echo, the last `delay` actions). The echo's future is fully
//! determined by your last `delay` actions, so that queue is all we need to remember.

use crate::{Action, Level};
use std::collections::{HashMap, VecDeque};

#[derive(Debug, Clone)]
pub struct Solution {
    /// Shortest winning action sequence, as a string like "RRD.U".
    pub moves: String,
    /// Number of distinct states explored before the solution was found.
    pub explored: usize,
}

#[derive(Clone, Copy, PartialEq, Eq, Hash)]
struct State {
    player: u8,
    echo: u8, // 255 = not spawned
    len: u8,  // actions remembered (min(t, delay))
    queue: u16, // base-5 digits, oldest = most significant
}

const NONE: u8 = 255;

fn pow5(n: u8) -> u16 {
    5u16.pow(n as u32)
}

impl State {
    fn oldest(&self) -> Action {
        Action::from_u8((self.queue / pow5(self.len - 1)) as u8).unwrap()
    }
}

/// Solve with the echo (normal rules). `limit` caps explored states.
pub fn solve(level: &Level, limit: usize) -> Option<Solution> {
    search(level, true, limit)
}

/// Solve as if the echo never appears: used to prove a level actually needs the echo.
pub fn solve_without_echo(level: &Level, limit: usize) -> Option<Solution> {
    search(level, false, limit)
}

fn search(level: &Level, with_echo: bool, limit: usize) -> Option<Solution> {
    let k = level.delay as u8;
    let start = State { player: level.start as u8, echo: NONE, len: 0, queue: 0 };
    let mut parent: HashMap<State, (State, Action)> = HashMap::with_capacity(1 << 14);
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
            return Some(Solution { moves: moves.into_iter().collect(), explored: parent.len() + 1 });
        }
        if parent.len() > limit {
            return None;
        }
        let echo = if s.echo == NONE { None } else { Some(s.echo as usize) };
        for a in Action::ALL {
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
            if let Some((p, e)) = level.step(s.player as usize, echo, a, spawn, echo_action) {
                let ns = State {
                    player: p as u8,
                    echo: e.map(|v| v as u8).unwrap_or(NONE),
                    len: nlen,
                    queue: nqueue,
                };
                if ns == start {
                    continue;
                }
                if let std::collections::hash_map::Entry::Vacant(v) = parent.entry(ns) {
                    v.insert((s, a));
                    q.push_back(ns);
                }
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Game;

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
    fn unsolvable_returns_none() {
        let l = Level::parse(&["S#E"], 2).unwrap();
        assert!(solve(&l, 100_000).is_none());
    }
}
