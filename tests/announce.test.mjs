// Unit tests for what the board says to screen readers (web/src/announce.ts): no DOM.
// Run: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { boardState, boardNews } from "../web/src/announce.ts";

// A small board: a plate and a door for A, a plate and two doors for B.
//   S . A a
//   . B b b
const tiles = "S.Aa.Bbb".split("");
const S = 0, A = 2, a = 3, B = 5, b1 = 6, b2 = 7;
const bit = (l) => 1 << (l.charCodeAt(0) - 65);
const NOBODY = -1;

test("boardState reads who stands on each plate, which doors are open, and whether the echo is out", () => {
  assert.deepEqual(boardState(tiles, S, NOBODY, 0), { plates: {}, doors: { A: false, B: false }, echo: false });
  assert.deepEqual(boardState(tiles, A, S, bit("A")), { plates: { A: "you" }, doors: { A: true, B: false }, echo: true });
  assert.deepEqual(boardState(tiles, S, B, bit("B")), { plates: { B: "echo" }, doors: { A: false, B: true }, echo: true });
  assert.deepEqual(boardState(tiles, A, A, bit("A")), { plates: { A: "both" }, doors: { A: true, B: false }, echo: true });
});

test("a door someone stands in stays open, as the board draws it", () => {
  assert.equal(boardState(tiles, a, NOBODY, 0).doors.A, true);
  assert.equal(boardState(tiles, S, b2, 0).doors.B, true);
});

test("the first look at a board, after a load or Start over, says nothing", () => {
  assert.equal(boardNews(null, boardState(tiles, S, NOBODY, 0)), "");
  assert.equal(boardNews(null, boardState(tiles, A, S, bit("A"))), "");
});

test("an ordinary step says nothing", () => {
  assert.equal(boardNews(boardState(tiles, S, NOBODY, 0), boardState(tiles, 1, NOBODY, 0)), "");
  assert.equal(boardNews(boardState(tiles, 1, S, 0), boardState(tiles, S, 1, 0)), "");
});

test("pressing a plate names the plate, who pressed it and the door it opens", () => {
  assert.equal(boardNews(boardState(tiles, 1, NOBODY, 0), boardState(tiles, A, NOBODY, bit("A"))), "You press plate A. Door A opens.");
  assert.equal(boardNews(boardState(tiles, S, 4, 0), boardState(tiles, S, B, bit("B"))), "The echo presses plate B. Door B opens.");
  assert.equal(boardNews(boardState(tiles, 1, 1, 0), boardState(tiles, A, A, bit("A"))), "You and the echo press plate A. Door A opens.");
});

test("holding a plate down says nothing more", () => {
  const held = boardState(tiles, A, NOBODY, bit("A"));
  assert.equal(boardNews(held, boardState(tiles, A, NOBODY, bit("A"))), "");
  // The echo joining you on a plate that's already down changes nothing either.
  assert.equal(boardNews(boardState(tiles, A, 1, bit("A")), boardState(tiles, A, A, bit("A"))), "");
  // Nor does handing it over: you step off as the echo steps on.
  assert.equal(boardNews(boardState(tiles, A, 1, bit("A")), boardState(tiles, 1, A, bit("A"))), "");
});

test("stepping off a plate says the door closes", () => {
  assert.equal(boardNews(boardState(tiles, A, NOBODY, bit("A")), boardState(tiles, 1, NOBODY, 0)), "Door A closes.");
});

test("a door closes only once nobody holds it: not while you stand in it, then when you step out", () => {
  const onPlate = boardState(tiles, S, A, bit("A"));
  const inDoor = boardState(tiles, a, 1, 0); // the echo stepped off; you're in the doorway
  assert.equal(boardNews(onPlate, inDoor), "");
  assert.equal(boardNews(inDoor, boardState(tiles, S, 1, 0)), "Door A closes.");
  // With two B doors, one held by the echo, B is still open.
  assert.equal(boardNews(boardState(tiles, b1, b2, 0), boardState(tiles, 4, b2, 0)), "");
  assert.equal(boardNews(boardState(tiles, 4, b2, 0), boardState(tiles, 4, 1, 0)), "Door B closes.");
});

test("the echo appearing is announced once", () => {
  const before = boardState(tiles, 1, NOBODY, 0);
  const out = boardState(tiles, 4, S, 0);
  assert.equal(boardNews(before, out), "Your echo appears.");
  assert.equal(boardNews(out, boardState(tiles, 1, 4, 0)), "");
});

test("several things in one step are said in order: echo, plates, then doors, letters alphabetical", () => {
  const before = boardState(tiles, 1, NOBODY, bit("B"));
  const after = boardState(tiles, A, S, bit("A"));
  assert.equal(boardNews(before, after), "Your echo appears. You press plate A. Door A opens. Door B closes.");
});

test("undoing back past the echo's arrival doesn't announce anything about the echo", () => {
  assert.equal(boardNews(boardState(tiles, 4, S, 0), boardState(tiles, 1, NOBODY, 0)), "");
});

test("E is the exit, not a plate: reaching it says nothing", () => {
  const withExit = "S.E".split("");
  assert.deepEqual(boardState(withExit, 2, 0, 0).plates, {});
  assert.equal(boardNews(boardState(withExit, 1, 0, 0), boardState(withExit, 2, 1, 0)), "");
});
