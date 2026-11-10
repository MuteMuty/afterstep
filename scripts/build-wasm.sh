#!/bin/sh
# Compile the Rust engine to WebAssembly and generate JS bindings for the web app.
set -e
export PATH="$HOME/.cargo/bin:$PATH"
cd "$(dirname "$0")/.."
cargo build --release --target wasm32-unknown-unknown --manifest-path engine/Cargo.toml
wasm-bindgen --target web --out-dir web/src/wasm --no-typescript \
  engine/target/wasm32-unknown-unknown/release/afterstep_engine.wasm
cat > web/src/wasm/afterstep_engine.d.ts <<'TS'
export default function init(input?: unknown): Promise<unknown>;
export class WasmGame {
  constructor(rows: string, delay: number);
  step(action: number): boolean;
  undo(): boolean;
  reset(): void;
  player(): number;
  echo(): number;
  echo_in(): number;
  open_doors(): number;
  moves(): number;
  won(): boolean;
  echo_blocked_last(): boolean;
  echo_next(): number;
  history(): string;
  load(moves: string): boolean;
  hint(): number;
  free(): void;
}
TS
ls -la web/src/wasm/*.wasm | awk '{print "wasm size:", $5}'
