// How a daily's result is scored, saved and written out, kept free of the DOM
// so tests/score.test.mjs can run it in Node. Each hint counts as one move,
// both in the score and against par, and a solve with any hint is never
// perfect: help was needed (lab#25).
//
// Saved per browser under one key. `results` keeps a plain move count per date,
// as older pages wrote and read it (and the streak counts it), so a result
// saved before hints counted means 0 hints. The hints of each saved best sit
// beside it in `bestHints` (only when there were any), and `hintsSeen` counts
// the hints shown on each puzzle so far: leaving, a reload or Start over keep
// them, since help already seen can't be unseen.

export type Result = { moves: number; hints: number };
export type Save = {
  learned: boolean;
  /** Date -> moves of the best solve, hints not included. */
  results: Record<string, number>;
  /** Date -> hints used in that best solve, when any. */
  bestHints: Record<string, number>;
  /** Date -> hints shown on that puzzle so far. */
  hintsSeen: Record<string, number>;
};

/** Only the entries whose value passes `ok`, from whatever was stored. */
function numbers(v: unknown, ok: (n: number) => boolean): Record<string, number> {
  const out: Record<string, number> = {};
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const [k, n] of Object.entries(v)) if (typeof n === "number" && Number.isInteger(n) && ok(n)) out[k] = n;
  }
  return out;
}

/** The save stored as `raw`; an empty one if it's missing or unreadable. */
export function readSave(raw: string | null): Save {
  let s: unknown = null;
  try { s = JSON.parse(raw ?? ""); } catch {}
  const o = s && typeof s === "object" && !Array.isArray(s) ? (s as Record<string, unknown>) : {};
  return {
    learned: !!o.learned,
    results: numbers(o.results, (n) => n > 0),
    bestHints: numbers(o.bestHints, (n) => n > 0),
    hintsSeen: numbers(o.hintsSeen, (n) => n > 0),
  };
}

/** The move count with hints counted: what's compared to par. */
export function total(r: Result): number {
  return r.moves + r.hints;
}

/** At par or better, with no help. */
export function isPerfect(r: Result, par: number): boolean {
  return r.hints === 0 && r.moves <= par;
}

/** " with 2 hints" when any were used, otherwise "". */
export function hintText(n: number): string {
  return n > 0 ? ` with ${n} ${n === 1 ? "hint" : "hints"}` : "";
}

/** True if `a` beats the saved `best`: fewer moves with hints counted, or as
 *  many with fewer hints. */
export function isBetter(a: Result, best: Result | null): boolean {
  if (!best) return true;
  return total(a) < total(best) || (total(a) === total(best) && a.hints < best.hints);
}

/** The saved best for a date, or null if it hasn't been solved here. */
export function bestResult(save: Save, date: string): Result | null {
  const moves = save.results[date];
  return moves ? { moves, hints: save.bestHints[date] ?? 0 } : null;
}

/** Save `r` as the date's best if it beats the one saved. Returns whether it did. */
export function recordResult(save: Save, date: string, r: Result): boolean {
  if (!isBetter(r, bestResult(save, date))) return false;
  save.results[date] = r.moves;
  if (r.hints > 0) save.bestHints[date] = r.hints;
  else delete save.bestHints[date];
  return true;
}

export function hintsSeen(save: Save, date: string): number {
  return save.hintsSeen[date] ?? 0;
}

/** One more hint shown on the date's puzzle. Returns the new count. */
export function countHint(save: Save, date: string): number {
  return (save.hintsSeen[date] = hintsSeen(save, date) + 1);
}

/** The win dialog's title. */
export function winTitle(r: Result, par: number): string {
  return isPerfect(r, par) ? "Perfect" : "Solved";
}

/** The solved line: "Solved in 38 moves with 2 hints, par 36" ("Solved in 5 moves" without a par). */
export function resultLine(r: Result, par?: number): string {
  return `Solved in ${total(r)} moves${hintText(r.hints)}${par ? `, par ${par}` : ""}`;
}

/** The copied result's first line: "Afterstep #12: 36 moves (par 36) ★"; the ★ only for a perfect solve. */
export function shareLine(id: number | string, r: Result, par: number): string {
  return `Afterstep #${id}: ${total(r)} moves${hintText(r.hints)} (par ${par})${isPerfect(r, par) ? " ★" : ""}`;
}

/** A solved puzzle in Past puzzles, in phrases that each keep to one line:
 *  ["solved in 14", "with 2 hints"]. */
export function archiveParts(r: Result): string[] {
  return [`solved in ${total(r)}`, ...(r.hints > 0 ? [hintText(r.hints).trim()] : [])];
}

/** The same as one line: "solved in 14 with 2 hints". */
export function archiveLine(r: Result): string {
  return archiveParts(r).join(" ");
}
