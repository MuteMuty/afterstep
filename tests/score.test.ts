// Unit tests for how a daily's result is scored, saved and written out
// (web/src/score.ts): no DOM. Each hint counts as one move (lab#25).
// Run: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readSave, total, isPerfect, hintText, isBetter, bestResult, recordResult,
  hintsSeen, countHint, winTitle, winBody, winParts, resultLine, shareLine, archiveLine, archiveParts, moveHintNote,
} from "../web/src/score.ts";

const DAY = "2026-11-21";

test("each hint counts as one move", () => {
  assert.equal(total({ moves: 36, hints: 0 }), 36);
  assert.equal(total({ moves: 36, hints: 2 }), 38);
});

test("a solve is perfect only at par or better and with no hints", () => {
  assert.equal(isPerfect({ moves: 36, hints: 0 }, 36), true);
  assert.equal(isPerfect({ moves: 35, hints: 0 }, 36), true);
  assert.equal(isPerfect({ moves: 37, hints: 0 }, 36), false);
  // Under par even with the hint counted, but help was needed.
  assert.equal(isPerfect({ moves: 30, hints: 1 }, 36), false);
  assert.equal(isPerfect({ moves: 36, hints: 1 }, 36), false);
  assert.equal(winTitle({ moves: 36, hints: 0 }, 36), "Perfect");
  assert.equal(winTitle({ moves: 36, hints: 1 }, 36), "Solved");
  assert.equal(winTitle({ moves: 40, hints: 0 }, 36), "Solved");
});

test("hint text says the hints are in the moves: nothing without hints, then singular and plural", () => {
  assert.equal(hintText(0), "");
  assert.equal(hintText(1), ", including 1 hint");
  assert.equal(hintText(2), ", including 2 hints");
  assert.equal(hintText(11), ", including 11 hints");
});

test("the win dialog says the hints are included, then par, then any streak", () => {
  assert.equal(winBody(4, { moves: 16, hints: 0 }, 16, 0), "Puzzle 4 in 16 moves. Par is 16.");
  assert.equal(winBody(4, { moves: 16, hints: 0 }, 16, 1), "Puzzle 4 in 16 moves. Par is 16.");
  assert.equal(winBody(4, { moves: 16, hints: 1 }, 16, 0), "Puzzle 4 in 17 moves, including 1 hint. Par is 16.");
  assert.equal(winBody(4, { moves: 16, hints: 11 }, 16, 0), "Puzzle 4 in 27 moves, including 11 hints. Par is 16.");
  assert.equal(winBody(4, { moves: 16, hints: 11 }, 16, 5), "Puzzle 4 in 27 moves, including 11 hints. Par is 16. You're on a 5-day streak.");
  assert.equal(winBody(4, { moves: 16, hints: 0 }, 16, 2), "Puzzle 4 in 16 moves. Par is 16. You're on a 2-day streak.");
});

test("the win dialog's text comes in phrases that each keep to one line", () => {
  assert.deepEqual(winParts(4, { moves: 16, hints: 0 }, 16, 0), ["Puzzle 4 in 16 moves.", "Par is 16."]);
  assert.deepEqual(winParts(4, { moves: 16, hints: 1 }, 16, 0), ["Puzzle 4 in 17 moves,", "including 1 hint.", "Par is 16."]);
  assert.deepEqual(winParts(4, { moves: 16, hints: 11 }, 16, 3),
    ["Puzzle 4 in 27 moves,", "including 11 hints.", "Par is 16.", "You're on a 3-day streak."]);
  // Joined, they're the dialog's text.
  assert.equal(winParts(4, { moves: 16, hints: 11 }, 16, 3).join(" "), winBody(4, { moves: 16, hints: 11 }, 16, 3));
});

test("the solved line, copied result and Past puzzles count hints as moves and say they're included", () => {
  assert.equal(resultLine({ moves: 36, hints: 0 }, 36), "Solved in 36 moves, par 36");
  assert.equal(resultLine({ moves: 36, hints: 1 }, 36), "Solved in 37 moves, including 1 hint, par 36");
  assert.equal(resultLine({ moves: 36, hints: 2 }, 36), "Solved in 38 moves, including 2 hints, par 36");
  assert.equal(resultLine({ moves: 5, hints: 0 }), "Solved in 5 moves");
  assert.equal(shareLine(12, { moves: 36, hints: 0 }, 36), "Afterstep #12: 36 moves (par 36) ★");
  assert.equal(shareLine(12, { moves: 40, hints: 0 }, 36), "Afterstep #12: 40 moves (par 36)");
  // Par right after the moves, so it can't be read as a par for hints.
  assert.equal(shareLine(12, { moves: 35, hints: 1 }, 36), "Afterstep #12: 36 moves (par 36), including 1 hint");
  assert.equal(shareLine(12, { moves: 16, hints: 11 }, 16), "Afterstep #12: 27 moves (par 16), including 11 hints");
  assert.equal(archiveLine({ moves: 14, hints: 0 }), "solved in 14");
  assert.equal(archiveLine({ moves: 13, hints: 1 }), "solved in 14, including 1 hint");
  assert.equal(archiveLine({ moves: 12, hints: 2 }), "solved in 14, including 2 hints");
  assert.deepEqual(archiveParts({ moves: 14, hints: 0 }), ["solved in 14"]);
  assert.deepEqual(archiveParts({ moves: 12, hints: 2 }), ["solved in 14,", "including 2 hints"]);
});

test("a daily's first counted hint says that each hint costs one move; later ones and a lesson's don't", () => {
  assert.equal(moveHintNote("move up", 1), "Hint: move up. Each hint costs one move.");
  assert.equal(moveHintNote("wait a turn", 1), "Hint: wait a turn. Each hint costs one move.");
  // Said once per puzzle (lab#55): the count is kept over a reload and Start over, so it isn't said again.
  assert.equal(moveHintNote("move left", 2), "Hint: move left.");
  assert.equal(moveHintNote("move left", 11), "Hint: move left.");
  // A lesson counts no hints.
  assert.equal(moveHintNote("move up", 0), "Hint: move up.");
});

test("a result is better when fewer moves with hints counted; on a tie, fewer hints", () => {
  assert.equal(isBetter({ moves: 36, hints: 0 }, null), true);
  assert.equal(isBetter({ moves: 36, hints: 2 }, { moves: 40, hints: 0 }), true);
  assert.equal(isBetter({ moves: 36, hints: 2 }, { moves: 37, hints: 0 }), false);
  assert.equal(isBetter({ moves: 36, hints: 2 }, { moves: 38, hints: 0 }), false);
  assert.equal(isBetter({ moves: 38, hints: 0 }, { moves: 36, hints: 2 }), true);
  assert.equal(isBetter({ moves: 36, hints: 0 }, { moves: 36, hints: 0 }), false);
});

test("an old save (no hint fields) still loads: its results had no hints", () => {
  const save = readSave(JSON.stringify({ learned: true, results: { "2026-11-10": 14, [DAY]: 36 } }));
  assert.equal(save.learned, true);
  assert.deepEqual(bestResult(save, "2026-11-10"), { moves: 14, hints: 0 });
  assert.deepEqual(bestResult(save, DAY), { moves: 36, hints: 0 });
  assert.equal(bestResult(save, "2026-11-11"), null);
  assert.equal(hintsSeen(save, DAY), 0);
  assert.equal(archiveLine(bestResult(save, "2026-11-10")!), "solved in 14");
});

test("a missing, broken or odd save starts empty instead of throwing", () => {
  for (const raw of [null, "", "nope", "null", "42", "[]"]) {
    const save = readSave(raw);
    assert.deepEqual(save, { learned: false, results: {}, bestHints: {}, hintsSeen: {} }, String(raw));
  }
  const odd = readSave(JSON.stringify({ learned: 1, results: { a: "x", b: -3, c: 9 }, bestHints: { c: "2", d: 1.5 }, hintsSeen: { c: -1, e: 3 } }));
  assert.deepEqual(odd, { learned: true, results: { c: 9 }, bestHints: {}, hintsSeen: { e: 3 } });
});

test("a hinted solve is saved with its hints and survives a save round trip", () => {
  const save = readSave(null);
  assert.equal(recordResult(save, DAY, { moves: 36, hints: 2 }), true);
  const again = readSave(JSON.stringify(save));
  assert.deepEqual(bestResult(again, DAY), { moves: 36, hints: 2 });
  // The moves stay a plain number, as older pages read them (and the streak does).
  assert.equal(again.results[DAY], 36);
});

test("a worse hinted solve never replaces a better stored one", () => {
  const save = readSave(JSON.stringify({ learned: true, results: { [DAY]: 37 } }));
  assert.equal(recordResult(save, DAY, { moves: 36, hints: 1 }), false, "37 with a hint ties the old 37 without");
  assert.equal(recordResult(save, DAY, { moves: 36, hints: 3 }), false);
  assert.deepEqual(bestResult(save, DAY), { moves: 37, hints: 0 });
  // A better one does, and an unaided one as good later clears the hints.
  assert.equal(recordResult(save, DAY, { moves: 34, hints: 1 }), true);
  assert.deepEqual(bestResult(save, DAY), { moves: 34, hints: 1 });
  assert.equal(recordResult(save, DAY, { moves: 36, hints: 0 }), false);
  assert.equal(recordResult(save, DAY, { moves: 35, hints: 0 }), true);
  assert.deepEqual(bestResult(save, DAY), { moves: 35, hints: 0 });
  assert.equal(DAY in save.bestHints, false);
});

test("hints seen on a puzzle are kept per puzzle and only ever go up", () => {
  const save = readSave(null);
  assert.equal(countHint(save, DAY), 1);
  assert.equal(countHint(save, DAY), 2);
  assert.equal(hintsSeen(save, DAY), 2);
  assert.equal(hintsSeen(save, "2026-11-20"), 0);
  // A reload reads them back.
  assert.equal(hintsSeen(readSave(JSON.stringify(save)), DAY), 2);
});
