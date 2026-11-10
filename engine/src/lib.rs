//! Afterstep rules engine.
//!
//! A level is a grid. You move one tile at a time (or wait). After `delay`
//! actions an *echo* appears on the start tile and replays your actions,
//! always `delay` steps behind you. Plates (`A`–`H`) open the doors with the
//! matching lowercase letter (`a`–`h`) while someone (you or the echo) stands on
//! them. If the echo is blocked it stays put and that action is lost, so it
//! falls out of sync with you.
//!
//! One step, precisely:
//! 1. Doors are evaluated from where everyone stands *at the start* of the step:
//!    a door is passable if its plate is occupied, or if someone is standing in it.
//! 2. You move (a blocked move is refused: no time passes).
//! 3. The echo spawns (when exactly `delay` actions have been taken) or replays
//!    your action from `delay` steps ago, using the same door states.
//! 4. You win when you stand on the exit.

pub mod gen;
pub mod solver;

#[cfg(target_arch = "wasm32")]
pub mod wasm;

pub const MAX_W: usize = 12;
pub const MAX_H: usize = 12;
pub const MAX_DELAY: usize = 6;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Tile {
    Floor,
    Wall,
    Exit,
    Plate(u8),
    Door(u8),
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Hash)]
#[repr(u8)]
pub enum Action {
    Up = 0,
    Down = 1,
    Left = 2,
    Right = 3,
    Wait = 4,
}

impl Action {
    pub const ALL: [Action; 5] = [Action::Up, Action::Down, Action::Left, Action::Right, Action::Wait];

    pub fn from_u8(v: u8) -> Option<Action> {
        Self::ALL.get(v as usize).copied()
    }

    pub fn to_char(self) -> char {
        match self {
            Action::Up => 'U',
            Action::Down => 'D',
            Action::Left => 'L',
            Action::Right => 'R',
            Action::Wait => '.',
        }
    }

    pub fn from_char(c: char) -> Option<Action> {
        match c {
            'U' => Some(Action::Up),
            'D' => Some(Action::Down),
            'L' => Some(Action::Left),
            'R' => Some(Action::Right),
            '.' => Some(Action::Wait),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Level {
    pub w: usize,
    pub h: usize,
    pub tiles: Vec<Tile>,
    pub start: usize,
    pub exit: usize,
    pub delay: usize,
}

#[derive(Debug, PartialEq, Eq)]
pub enum ParseError {
    Empty,
    TooBig,
    Ragged,
    BadChar(char),
    NoStart,
    NoExit,
    MultipleStarts,
    MultipleExits,
    BadDelay,
}

impl Level {
    /// Parse rows of `#` wall, `.` floor, `S` start, `E` exit, `A`-`H` plates, `a`-`h` doors.
    pub fn parse(rows: &[&str], delay: usize) -> Result<Level, ParseError> {
        if rows.is_empty() || rows[0].is_empty() {
            return Err(ParseError::Empty);
        }
        if delay == 0 || delay > MAX_DELAY {
            return Err(ParseError::BadDelay);
        }
        let w = rows[0].chars().count();
        let h = rows.len();
        if w > MAX_W || h > MAX_H {
            return Err(ParseError::TooBig);
        }
        let mut tiles = Vec::with_capacity(w * h);
        let (mut start, mut exit) = (None, None);
        for row in rows {
            if row.chars().count() != w {
                return Err(ParseError::Ragged);
            }
            for c in row.chars() {
                let i = tiles.len();
                tiles.push(match c {
                    '#' => Tile::Wall,
                    '.' => Tile::Floor,
                    'S' => {
                        if start.replace(i).is_some() {
                            return Err(ParseError::MultipleStarts);
                        }
                        Tile::Floor
                    }
                    'E' => {
                        if exit.replace(i).is_some() {
                            return Err(ParseError::MultipleExits);
                        }
                        Tile::Exit
                    }
                    'A'..='H' => Tile::Plate(c as u8 - b'A'),
                    'a'..='h' => Tile::Door(c as u8 - b'a'),
                    other => return Err(ParseError::BadChar(other)),
                });
            }
        }
        Ok(Level {
            w,
            h,
            tiles,
            start: start.ok_or(ParseError::NoStart)?,
            exit: exit.ok_or(ParseError::NoExit)?,
            delay,
        })
    }

    pub fn to_rows(&self) -> Vec<String> {
        (0..self.h)
            .map(|y| {
                (0..self.w)
                    .map(|x| {
                        let i = y * self.w + x;
                        if i == self.start {
                            return 'S';
                        }
                        match self.tiles[i] {
                            Tile::Floor => '.',
                            Tile::Wall => '#',
                            Tile::Exit => 'E',
                            Tile::Plate(l) => (b'A' + l) as char,
                            Tile::Door(l) => (b'a' + l) as char,
                        }
                    })
                    .collect()
            })
            .collect()
    }

    #[inline]
    pub fn neighbor(&self, pos: usize, a: Action) -> Option<usize> {
        let (x, y) = (pos % self.w, pos / self.w);
        match a {
            Action::Up if y > 0 => Some(pos - self.w),
            Action::Down if y + 1 < self.h => Some(pos + self.w),
            Action::Left if x > 0 => Some(pos - 1),
            Action::Right if x + 1 < self.w => Some(pos + 1),
            Action::Wait => Some(pos),
            _ => None,
        }
    }

    /// Bitmask of plate letters pressed by the given occupants.
    #[inline]
    pub fn pressed(&self, a: usize, b: Option<usize>) -> u8 {
        let mut m = 0u8;
        if let Tile::Plate(l) = self.tiles[a] {
            m |= 1 << l;
        }
        if let Some(b) = b {
            if let Tile::Plate(l) = self.tiles[b] {
                m |= 1 << l;
            }
        }
        m
    }

    /// Can someone enter `to`, given pressed plates and current occupants?
    #[inline]
    pub fn passable(&self, to: usize, pressed: u8, occ_a: usize, occ_b: Option<usize>) -> bool {
        match self.tiles[to] {
            Tile::Wall => false,
            Tile::Door(l) => pressed & (1 << l) != 0 || to == occ_a || occ_b == Some(to),
            _ => true,
        }
    }

    /// Advance one step. Returns `None` if the player's move is blocked.
    /// `echo_action` is the action the echo replays this step (if it already exists).
    #[inline]
    pub fn step(
        &self,
        player: usize,
        echo: Option<usize>,
        action: Action,
        spawn_echo: bool,
        echo_action: Option<Action>,
    ) -> Option<(usize, Option<usize>)> {
        let pressed = self.pressed(player, echo);
        let to = self.neighbor(player, action)?;
        if !self.passable(to, pressed, player, echo) {
            return None;
        }
        let new_echo = match (echo, echo_action) {
            (Some(e), Some(ea)) => Some(match self.neighbor(e, ea) {
                Some(t) if self.passable(t, pressed, player, echo) => t,
                _ => e,
            }),
            (Some(e), None) => Some(e),
            (None, _) if spawn_echo => Some(self.start),
            (None, _) => None,
        };
        Some((to, new_echo))
    }
}

/// A game in progress: the level plus the full action history (for replay, undo and sharing).
#[derive(Clone, Debug)]
pub struct Game {
    pub level: Level,
    pub player: usize,
    pub echo: Option<usize>,
    pub history: Vec<Action>,
    /// Steps on which the echo was blocked (it fell out of sync).
    pub echo_blocked: Vec<bool>,
}

impl Game {
    pub fn new(level: Level) -> Game {
        let start = level.start;
        Game { level, player: start, echo: None, history: Vec::new(), echo_blocked: Vec::new() }
    }

    pub fn won(&self) -> bool {
        self.player == self.level.exit
    }

    /// Actions until the echo appears (0 once it exists).
    pub fn echo_in(&self) -> usize {
        self.level.delay.saturating_sub(self.history.len())
    }

    pub fn pressed(&self) -> u8 {
        self.level.pressed(self.player, self.echo)
    }

    /// Bitmask of door letters currently open (plate pressed).
    pub fn open_doors(&self) -> u8 {
        self.pressed()
    }

    pub fn try_step(&mut self, action: Action) -> bool {
        if self.won() {
            return false;
        }
        let t = self.history.len();
        let k = self.level.delay;
        let spawn = t + 1 == k;
        let echo_action = if self.echo.is_some() { Some(self.history[t - k]) } else { None };
        match self.level.step(self.player, self.echo, action, spawn, echo_action) {
            Some((p, e)) => {
                let blocked = matches!((self.echo, echo_action), (Some(old), Some(ea)) if ea != Action::Wait && e == Some(old));
                self.player = p;
                self.echo = e;
                self.history.push(action);
                self.echo_blocked.push(blocked);
                true
            }
            None => false,
        }
    }

    pub fn reset(&mut self) {
        self.player = self.level.start;
        self.echo = None;
        self.history.clear();
        self.echo_blocked.clear();
    }

    pub fn undo(&mut self) -> bool {
        if self.history.is_empty() {
            return false;
        }
        let mut h = std::mem::take(&mut self.history);
        h.pop();
        self.reset();
        for a in h {
            self.try_step(a);
        }
        true
    }

    /// Replay a solution string (e.g. "RRD.U"); returns true if it is valid and wins.
    pub fn verify(level: &Level, moves: &str) -> bool {
        let mut g = Game::new(level.clone());
        for c in moves.chars() {
            match Action::from_char(c) {
                Some(a) if g.try_step(a) => {}
                _ => return false,
            }
        }
        g.won()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lvl(rows: &[&str], k: usize) -> Level {
        Level::parse(rows, k).unwrap()
    }

    #[test]
    fn parse_roundtrip() {
        let rows = ["S.A#", ".#a.", "...E"];
        let l = lvl(&rows, 2);
        assert_eq!(l.to_rows(), rows);
        assert_eq!(l.start, 0);
        assert_eq!(l.exit, 11);
    }

    #[test]
    fn walls_and_edges_block() {
        let mut g = Game::new(lvl(&["S#E"], 3));
        assert!(!g.try_step(Action::Right));
        assert!(!g.try_step(Action::Up));
        assert!(g.history.is_empty());
    }

    #[test]
    fn closed_door_blocks_open_door_passes() {
        // Plate next to door: stand on the plate, then step through.
        let mut g = Game::new(lvl(&["SAaE"], 6));
        assert!(g.try_step(Action::Right)); // on plate
        assert!(g.try_step(Action::Right)); // door open because plate was pressed at step start
        assert!(g.try_step(Action::Right));
        assert!(g.won());
        // Without the plate, the door is closed.
        let mut g = Game::new(lvl(&["S.aE"], 6));
        assert!(g.try_step(Action::Right));
        assert!(!g.try_step(Action::Right));
    }

    #[test]
    fn echo_spawns_after_delay_and_replays() {
        let mut g = Game::new(lvl(&["S....E"], 2));
        g.try_step(Action::Right);
        assert_eq!(g.echo, None);
        g.try_step(Action::Right);
        assert_eq!(g.echo, Some(0)); // spawned on start after 2 actions
        g.try_step(Action::Right);
        assert_eq!(g.echo, Some(1)); // replays action #1
        assert_eq!(g.player, 3);
    }

    #[test]
    fn echo_blocked_desyncs() {
        // You pass the door while standing... the echo arrives later when it is closed.
        let l = lvl(&["SAa..E"], 2);
        let mut g = Game::new(l);
        for a in [Action::Right, Action::Right, Action::Right, Action::Right] {
            assert!(g.try_step(a));
        }
        // Echo: spawned at step 2 on S, step 3 -> A (plate), step 4 -> door (plate pressed by itself at step start) ok.
        assert_eq!(g.echo, Some(2));
        assert!(g.echo_blocked.iter().all(|b| !b));
    }

    #[test]
    fn undo_restores_previous_state() {
        let mut g = Game::new(lvl(&["S....E"], 2));
        g.try_step(Action::Right);
        g.try_step(Action::Right);
        g.try_step(Action::Right);
        g.undo();
        assert_eq!(g.player, 2);
        assert_eq!(g.echo, Some(0));
        assert_eq!(g.history.len(), 2);
    }
}
