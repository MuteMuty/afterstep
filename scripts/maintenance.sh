#!/bin/sh
# Night shift maintenance: keep >= 21 days of verified daily puzzles ahead.
# Prints CHANGED or UNCHANGED as its last line; exits non-zero if verification fails.
set -e
export PATH="$HOME/.cargo/bin:$PATH"
cd "$(dirname "$0")/.."
TODAY=$(date +%Y-%m-%d)
cargo build -q --release --features gen --manifest-path engine/Cargo.toml
engine/target/release/afterstep-gen daily levels/daily "$TODAY" 22 | grep -v "exists, kept" || true
engine/target/release/afterstep-gen check levels/daily/*.json > /dev/null
if [ -n "$(git status --porcelain levels/)" ]; then echo CHANGED; else echo UNCHANGED; fi
