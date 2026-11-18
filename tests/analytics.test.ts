// Unit tests for Afterstep's usage events (lab#71): when the lab's shared script
// may load (web/src/analytics.ts), and the allow-list and the once-per-puzzle
// play events (web/src/analytics-events.ts). No DOM. Run: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { isProduction, optedOut, shouldLoad, SCRIPT } from "../web/src/analytics.ts";
import { bucket, events, MOVES_BUCKETS, movesBucket, playEvents, PROJECT } from "../web/src/analytics-events.ts";
import type { Index } from "../web/src/levels.ts";

const INDEX: Index = {
  daily: [
    { id: 1, date: "2026-11-10", tier: "easy", par: 9 },
    { id: 2, date: "2026-11-11", tier: "medium", par: 21 },
  ],
  tutorial: [
    { id: "t1", delay: 6, grid: ["S.Aa.E"] },
    { id: "t2", delay: 2, grid: ["S.E"] },
  ],
};
const none = { nav: {}, win: {} };

test("the shared script comes from the hub, by its absolute address", () => {
  assert.equal(SCRIPT, "https://lab.brightloopapps.com/analytics/v1.js");
});

test("only *.brightloopapps.com counts as production", () => {
  assert.equal(isProduction("afterstep.brightloopapps.com"), true);
  assert.equal(isProduction("localhost"), false);
  assert.equal(isProduction("127.0.0.1"), false);
  assert.equal(isProduction("afterstep.erik.workers.dev"), false);
  assert.equal(isProduction("brightloopapps.com.example.org"), false);
  assert.equal(isProduction("evilbrightloopapps.com"), false);
});

test("Do Not Track (either spelling) and Global Privacy Control opt out", () => {
  assert.equal(optedOut({}, {}), false);
  assert.equal(optedOut({ doNotTrack: "1" }, {}), true);
  assert.equal(optedOut({ doNotTrack: "yes" }, {}), true);
  assert.equal(optedOut({}, { doNotTrack: "1" }), true);
  assert.equal(optedOut({ globalPrivacyControl: true }, {}), true);
  assert.equal(optedOut({ doNotTrack: "0", globalPrivacyControl: false }, { doNotTrack: null }), false);
});

test("the script loads only in production for a visitor who didn't opt out", () => {
  assert.equal(shouldLoad("afterstep.brightloopapps.com", none.nav, none.win), true);
  assert.equal(shouldLoad("localhost", none.nav, none.win), false);
  assert.equal(shouldLoad("afterstep.erik.workers.dev", none.nav, none.win), false);
  assert.equal(shouldLoad("afterstep.brightloopapps.com", { doNotTrack: "1" }, {}), false);
  assert.equal(shouldLoad("afterstep.brightloopapps.com", { globalPrivacyControl: true }, {}), false);
});

test("bucket labels match the hub's", () => {
  assert.equal(bucket(7, [1, 5, 10]), "5-9");
  assert.equal(bucket(12, [1, 5, 10]), "10+");
  assert.equal(bucket(0, [1, 5, 10]), "<1");
});

test("move counts are bucketed coarsely around the puzzles' pars", () => {
  assert.deepEqual(MOVES_BUCKETS, ["1-10", "11-20", "21-30", "31-40", "41-60", "61+"]);
  assert.equal(movesBucket(1), "1-10");
  assert.equal(movesBucket(10), "1-10");
  assert.equal(movesBucket(11), "11-20");
  assert.equal(movesBucket(24), "21-30");
  assert.equal(movesBucket(39), "31-40");
  assert.equal(movesBucket(41), "41-60");
  assert.equal(movesBucket(250), "61+");
});

test("the allow-list: a pageview, and play started and finished with enum-like values only", () => {
  assert.equal(PROJECT, "afterstep");
  const allow = events(INDEX);
  assert.deepEqual(Object.keys(allow).sort(), ["$pageview", "play_finished", "play_started"]);
  assert.deepEqual(allow.$pageview, {});
  const days = ["2026-11-10", "2026-11-11", "t1", "t2"];
  assert.deepEqual(allow.play_started, { mode: ["daily", "past", "tutorial"], day: days });
  assert.deepEqual(allow.play_finished, { mode: ["daily", "past", "tutorial"], day: days, moves_bucket: MOVES_BUCKETS, hinted: [true, false] });
});

/** Every property sent is listed in the allow-list for its event. */
function assertAllowed(allow: ReturnType<typeof events>, sent: [string, Record<string, unknown>][]) {
  for (const [name, props] of sent) {
    const spec = allow[name as keyof typeof allow] as Record<string, readonly unknown[]>;
    assert.ok(spec, `${name} isn't allow-listed`);
    for (const [k, v] of Object.entries(props)) assert.ok(spec[k]?.includes(v), `${name}.${k} = ${JSON.stringify(v)} isn't allow-listed`);
  }
}

test("play_started and play_finished go once per puzzle per page load, with allow-listed values", () => {
  const sent: [string, Record<string, unknown>][] = [];
  const plays = playEvents((name, props) => sent.push([name, props]));
  // The first move, then more moves, an undo, Start over and a replay of the same puzzle.
  plays.started("tutorial", "t1");
  plays.started("tutorial", "t1");
  plays.finished("tutorial", "t1", 5, false);
  plays.started("tutorial", "t1");
  plays.finished("tutorial", "t1", 7, true);
  // Today's puzzle, solved with a hint.
  plays.started("daily", "2026-11-11");
  plays.finished("daily", "2026-11-11", 22, true);
  // The same puzzle seen as a past one later (after midnight) is still the same puzzle.
  plays.started("past", "2026-11-11");
  plays.finished("past", "2026-11-11", 21, false);
  assert.deepEqual(sent, [
    ["play_started", { mode: "tutorial", day: "t1" }],
    ["play_finished", { mode: "tutorial", day: "t1", moves_bucket: "1-10", hinted: false }],
    ["play_started", { mode: "daily", day: "2026-11-11" }],
    ["play_finished", { mode: "daily", day: "2026-11-11", moves_bucket: "21-30", hinted: true }],
  ]);
  assertAllowed(events(INDEX), sent);
});

test("a raw move count is never sent", () => {
  const sent: [string, Record<string, unknown>][] = [];
  const plays = playEvents((name, props) => sent.push([name, props]));
  plays.finished("past", "2026-11-10", 17, false);
  assert.deepEqual(sent, [["play_finished", { mode: "past", day: "2026-11-10", moves_bucket: "11-20", hinted: false }]]);
  assert.ok(!Object.values(sent[0][1]).includes(17));
});

test("a sender that throws doesn't break the game, and the puzzle still counts as sent", () => {
  let calls = 0;
  const plays = playEvents(() => { calls++; throw new Error("blocked"); });
  assert.doesNotThrow(() => plays.started("daily", "2026-11-10"));
  assert.doesNotThrow(() => plays.started("daily", "2026-11-10"));
  assert.equal(calls, 1);
});
