# Afterstep

**A daily puzzle where your past self holds the doors.** Play it at **[afterstep.brightloopapps.com](https://afterstep.brightloopapps.com)**.

A few moves after you start, an **echo** of you appears and repeats everything you did, always the same number of moves behind. Plates open doors only while someone stands on them, so you plan your route now for the echo to hold a door for you later. If the echo bumps into a closed door, it falls out of sync, and the hardest puzzles need you to do that on purpose.

## How it's built

| Part | What it does |
|---|---|
| `engine/` (Rust) | The rules, a breadth-first **solver**, and a seeded **level generator**. Compiled to WebAssembly for the browser, so the game and the generator share one source of truth. |
| `engine/src/bin/gen.rs` | CLI that generates each day's puzzle, proves it's solvable, proves it **can't** be solved without the echo, and records par (the optimal move count). |
| `web/` (TypeScript, Vite) | A small, dependency-free front end: ~40 KB gzipped including the engine. |
| `levels/` | Hand-made lessons and generated daily puzzles, all verified by the solver. |

The solver searches states of (you, your echo, your last *k* moves): the echo's future is fully determined by those moves, so nothing else needs remembering. Hard puzzles explore 250k–400k states and still generate in about a second.

Headings use **Young Serif** by Bastien Sozeau ([noirblancrouge/YoungSerif](https://github.com/noirblancrouge/YoungSerif), listed in [google/fonts `ofl/youngserif`](https://github.com/google/fonts/tree/main/ofl/youngserif)), licensed under the SIL Open Font License 1.1 ([`web/public/fonts/OFL.txt`](web/public/fonts/OFL.txt)). Afterstep serves it itself, so the page asks no other site for fonts. `web/public/fonts/YoungSerif-latin.woff2` (18,520 bytes, version 1.0) is the Latin subset Google Fonts serves, downloaded on 2026-11-13 from `https://fonts.gstatic.com/s/youngserif/v2/3qTpojO2nS2VtkB3KtkQZ1t93kY6ah7E.woff2` (SHA-256 `a46a84bfaa83dea2fa2d034dbf9b8f119a0872d78d28aa2cfe06ced9c1d2ef9e`); `OFL.txt` is from `https://raw.githubusercontent.com/google/fonts/main/ofl/youngserif/OFL.txt`.

## Run it

```sh
# needs Rust (with the wasm32-unknown-unknown target), wasm-bindgen-cli 0.2.130 and Node
npm install
npm run dev                         # local dev server
cargo test --manifest-path engine/Cargo.toml --features gen
cargo run --release --manifest-path engine/Cargo.toml --features gen -- daily levels/daily 2026-11-10 14
cargo run --release --manifest-path engine/Cargo.toml --features gen -- check levels/daily/*.json
npm run deploy                      # build and deploy to Cloudflare
```

Made by [Erik Pahor](https://github.com/MuteMuty) at [BrightLoop Lab](https://lab.brightloopapps.com).
