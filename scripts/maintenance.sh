#!/bin/sh
# Night shift maintenance: keep >= 21 days of verified daily puzzles ahead.
# Prints CHANGED or UNCHANGED as its last line; exits non-zero if generation,
# verification or the 21-day buffer check fails (never fails silently).
set -e
export PATH="$HOME/.cargo/bin:$PATH"
cd "$(dirname "$0")/.."
GEN="${AFTERSTEP_GEN:-engine/target/release/afterstep-gen}"
TODAY=$(date +%Y-%m-%d)
cargo build -q --release --features gen --manifest-path engine/Cargo.toml
if ! OUT=$("$GEN" daily levels/daily "$TODAY" 22); then
  echo "puzzle generator failed" >&2
  exit 1
fi
printf '%s\n' "$OUT" | grep -v "exists, kept" || true
"$GEN" check levels/daily/*.json > /dev/null
WANT=$(date -v+21d +%Y-%m-%d)
LAST=$(ls levels/daily | sort | tail -1 | sed 's/\.json$//')
if [ "$LAST" \< "$WANT" ]; then
  echo "puzzle buffer too short: last puzzle $LAST, need $WANT or later" >&2
  exit 1
fi
if [ -n "$(git status --porcelain levels/)" ]; then echo CHANGED; else echo UNCHANGED; fi
