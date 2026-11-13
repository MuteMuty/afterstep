// Unit tests for Afterstep's hash routes (web/src/route.ts): no DOM.
// Run: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRoute, routeHash, routeTitle, shareUrl, HOME_TITLE } from "../web/src/route.ts";

// What the site knows when it reads a link: today's date, the puzzles out so far, the lessons.
const ctx = { today: "2026-11-13", dates: ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"], lessons: 5 };

test("the bare URL, # and #/ are today's puzzle", () => {
  for (const hash of ["", "#", "#/"]) assert.deepEqual(parseRoute(hash, ctx), { kind: "today" }, JSON.stringify(hash));
});

test("#/today is also today's puzzle", () => {
  assert.deepEqual(parseRoute("#/today", ctx), { kind: "today" });
});

test("lessons are #/learn/1 to #/learn/<count>, counted from 1", () => {
  assert.deepEqual(parseRoute("#/learn/1", ctx), { kind: "learn", step: 0 });
  assert.deepEqual(parseRoute("#/learn/2", ctx), { kind: "learn", step: 1 });
  assert.deepEqual(parseRoute("#/learn/5", ctx), { kind: "learn", step: 4 });
});

test("Past puzzles is #/past", () => {
  assert.deepEqual(parseRoute("#/past", ctx), { kind: "past" });
});

test("a puzzle that's out is #/puzzle/<date>, today's included", () => {
  assert.deepEqual(parseRoute("#/puzzle/2026-11-10", ctx), { kind: "puzzle", date: "2026-11-10" });
  assert.deepEqual(parseRoute("#/puzzle/2026-11-13", ctx), { kind: "puzzle", date: "2026-11-13" });
});

test("a puzzle date that isn't out yet, never existed or is malformed reads as null", () => {
  const bad = [
    "#/puzzle/2026-11-14", // in the future (and maybe already generated)
    "#/puzzle/2027-01-01", // far future
    "#/puzzle/2026-11-09", // before the first puzzle
    "#/puzzle/2026-02-30", // no such day
    "#/puzzle/2026-13-01",
    "#/puzzle/2026-11-1",
    "#/puzzle/26-11-10",
    "#/puzzle/2026-11-10x",
    "#/puzzle/2026-11-10/",
    "#/puzzle/",
    "#/puzzle",
    "#/puzzle/today",
    "#/puzzle/%3Cscript%3E",
  ];
  for (const hash of bad) assert.equal(parseRoute(hash, ctx), null, hash);
});

test("a lesson that doesn't exist or is written oddly reads as null", () => {
  for (const hash of ["#/learn/0", "#/learn/6", "#/learn/02", "#/learn/-1", "#/learn/1.5", "#/learn/", "#/learn", "#/learn/two", "#/learn/1/"])
    assert.equal(parseRoute(hash, ctx), null, hash);
});

test("unknown routes read as null", () => {
  for (const hash of ["#/nope", "#past", "#/Past", "#/past/", "#//", "#/today/", "#learn/1", "#/?utm_source=x", "##/past"])
    assert.equal(parseRoute(hash, ctx), null, hash);
});

test("routeHash writes each route's canonical hash, today's as none", () => {
  assert.equal(routeHash({ kind: "today" }), "");
  assert.equal(routeHash({ kind: "learn", step: 0 }), "#/learn/1");
  assert.equal(routeHash({ kind: "learn", step: 4 }), "#/learn/5");
  assert.equal(routeHash({ kind: "past" }), "#/past");
  assert.equal(routeHash({ kind: "puzzle", date: "2026-11-10" }), "#/puzzle/2026-11-10");
});

test("routeHash and parseRoute round-trip", () => {
  const routes = [{ kind: "today" }, { kind: "past" }, { kind: "learn", step: 2 }, { kind: "puzzle", date: "2026-11-11" }];
  for (const r of routes) assert.deepEqual(parseRoute(routeHash(r), ctx), r);
});

test("the title names the screen", () => {
  assert.equal(routeTitle({ kind: "today" }), HOME_TITLE);
  assert.match(HOME_TITLE, /^Afterstep/);
  assert.equal(routeTitle({ kind: "learn", step: 1 }), "Afterstep · Lesson 2");
  assert.equal(routeTitle({ kind: "past" }), "Afterstep · Past puzzles");
  assert.equal(routeTitle({ kind: "puzzle", date: "2026-11-10" }), "Afterstep · 10 Nov");
  assert.equal(routeTitle({ kind: "puzzle", date: "2026-01-03" }), "Afterstep · 3 Jan");
  assert.equal(routeTitle({ kind: "puzzle", date: "2026-12-31" }), "Afterstep · 31 Dec");
});

test("a past puzzle's result links to that puzzle, today's to the home page, with no extra parameters", () => {
  assert.equal(shareUrl("2026-11-10", "2026-11-13"), "https://afterstep.brightloopapps.com/#/puzzle/2026-11-10");
  assert.equal(shareUrl("2026-11-13", "2026-11-13"), "https://afterstep.brightloopapps.com");
});
