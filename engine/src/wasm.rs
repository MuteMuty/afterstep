//! Browser bindings. The web app keeps no game logic of its own: every move goes through here.

use crate::{solver, Action, Game, Level};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct WasmGame {
    game: Game,
}

#[wasm_bindgen]
impl WasmGame {
    /// `rows` joined with '\n'.
    #[wasm_bindgen(constructor)]
    pub fn new(rows: &str, delay: usize) -> Result<WasmGame, JsError> {
        let rows: Vec<&str> = rows.lines().collect();
        let level = Level::parse(&rows, delay).map_err(|e| JsError::new(&format!("{e:?}")))?;
        Ok(WasmGame { game: Game::new(level) })
    }

    /// 0 up, 1 down, 2 left, 3 right, 4 wait. Returns false if the move is blocked.
    pub fn step(&mut self, action: u8) -> bool {
        Action::from_u8(action).is_some_and(|a| self.game.try_step(a))
    }

    pub fn undo(&mut self) -> bool {
        self.game.undo()
    }

    pub fn reset(&mut self) {
        self.game.reset()
    }

    pub fn player(&self) -> usize {
        self.game.player
    }

    /// -1 while the echo hasn't appeared yet.
    pub fn echo(&self) -> i32 {
        self.game.echo.map_or(-1, |e| e as i32)
    }

    pub fn echo_in(&self) -> usize {
        self.game.echo_in()
    }

    /// Bitmask of open door letters (bit 0 = a).
    pub fn open_doors(&self) -> u8 {
        self.game.open_doors()
    }

    pub fn moves(&self) -> usize {
        self.game.history.len()
    }

    pub fn won(&self) -> bool {
        self.game.won()
    }

    /// True if the echo was blocked on the last step (it just fell out of sync).
    pub fn echo_blocked_last(&self) -> bool {
        self.game.echo_blocked.last().copied().unwrap_or(false)
    }

    /// The echo's next replayed action (0-4), or 255 if none.
    pub fn echo_next(&self) -> u8 {
        let t = self.game.history.len();
        let k = self.game.level.delay;
        if self.game.echo.is_some() && t >= k {
            self.game.history[t - k] as u8
        } else {
            255
        }
    }

    pub fn history(&self) -> String {
        self.game.history.iter().map(|a| a.to_char()).collect()
    }

    /// Replay a move string from the start. Returns false if any move is invalid.
    pub fn load(&mut self, moves: &str) -> bool {
        self.game.reset();
        for c in moves.chars() {
            match Action::from_char(c) {
                Some(a) if self.game.try_step(a) => {}
                _ => return false,
            }
        }
        true
    }

    /// Shortest solution from the *start* (used for hints). Empty if none found.
    pub fn solve(&self) -> String {
        solver::solve(&self.game.level, 300_000).map(|s| s.moves).unwrap_or_default()
    }

    /// Hint from the current position: replay history + search would be expensive, so
    /// we return the next move of the optimal solution if the player is still on it.
    pub fn hint(&self) -> u8 {
        let sol = self.solve();
        let hist = self.history();
        if sol.starts_with(&hist) {
            sol[hist.len()..].chars().next().and_then(Action::from_char).map_or(255, |a| a as u8)
        } else {
            255
        }
    }
}
