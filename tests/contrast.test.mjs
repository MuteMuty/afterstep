// Plate and door letters reach WCAG AA (4.5:1) against what's behind them, in
// both themes, read from the real stylesheet (web/src/style.css). No DOM.
// Run: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../web/src/style.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** The declarations of the first rule whose selector is exactly `selector`, as { prop: value }. */
function rule(source, selector) {
  const re = new RegExp(`(^|[}\\s])${selector.replace(/[.*+?^${}()|[\]\\:]/g, "\\$&")}\\s*\\{([^}]*)\\}`);
  const m = source.match(re);
  assert.ok(m, `no rule for ${selector}`);
  return Object.fromEntries(
    m[2].split(";").map((d) => d.trim()).filter(Boolean).map((d) => {
      const i = d.indexOf(":");
      return [d.slice(0, i).trim(), d.slice(i + 1).trim()];
    }),
  );
}

const light = css.match(/@media \(prefers-color-scheme: light\)\s*\{([\s\S]*?\}\s*)\}/)[1];
const themes = { dark: rule(css, ":root"), light: { ...rule(css, ":root"), ...rule(light, ":root") } };

function lum(hex) {
  assert.match(hex, /^#[0-9a-f]{6}$/i, `expected a #rrggbb colour, got ${hex}`);
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [16, 8, 0].map((s) => {
    const c = ((n >> s) & 255) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Resolve a value like var(--l2) or var(--c) (bound to the letter's colour) in a theme. */
function resolve(value, theme, letterColour) {
  const m = value.match(/^var\((--[\w-]+)\)$/);
  if (!m) return value;
  if (m[1] === "--c") return letterColour;
  assert.ok(m[1] in theme, `${m[1]} isn't defined`);
  return resolve(theme[m[1]], theme, letterColour);
}

// Each letter's colour (--l0..--l3), the tile under it (--cell), and how plates and doors draw their letters.
const tile = "var(--cell)";
const draws = {
  "plate letter": { color: rule(css, ".cell.plate::after").color, background: tile },
  "pressed plate letter": { color: rule(css, ".cell.plate.pressed::after").color, background: rule(css, ".cell.plate.pressed::after").background },
  "door letter": { color: rule(css, ".door-l").color, background: rule(css, ".door-l").background },
};

test("the stylesheet defines four letter colours in each theme", () => {
  for (const [name, t] of Object.entries(themes)) for (let i = 0; i < 4; i++) assert.ok(t[`--l${i}`], `${name} --l${i}`);
  assert.ok(rule(light, ":root")["--l0"], "the light theme sets its own letter colours");
});

for (const [name, t] of Object.entries(themes)) {
  for (let i = 0; i < 4; i++) {
    const letter = "ABCD"[i];
    const c = t[`--l${i}`];
    for (const [what, d] of Object.entries(draws)) {
      test(`${name}: ${what} ${letter} (${c}) is at least 4.5:1`, () => {
        const fg = resolve(d.color, t, c), bg = resolve(d.background, t, c);
        const r = contrast(fg, bg);
        assert.ok(r >= 4.5, `${fg} on ${bg} is ${r.toFixed(2)}:1`);
      });
    }
  }
}
