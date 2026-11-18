// Afterstep's usage events: the only ones it may send (lab SAFETY.md, "Usage events", lab#71), following
// the lab-wide convention: `$pageview`, then `play_started` on a puzzle's first move and `play_finished`
// on its solve, each at most once per puzzle per page load (undo, Start over and replaying don't repeat
// them). Properties are enum-like or bucketed, never a raw move count or anything a visitor typed.
// Adding an event or value here is a normal commit; anything new in kind needs Erik.
import type { AllowList, Props } from "./analytics";
import type { Index } from "./levels";

export const PROJECT = "afterstep";

/** Today's daily, an older one from Past puzzles, or a lesson from How to play. */
export type Mode = "daily" | "past" | "tutorial";
const MODES: Mode[] = ["daily", "past", "tutorial"];

/** A label for a count, as the hub labels them: `edges` are ascending lower bounds, so
 *  bucket(7, [1, 5, 10]) is "5-9" and 12 is "10+". */
export function bucket(n: number, edges: readonly number[]): string {
  let i = edges.length - 1;
  while (i >= 0 && n < edges[i]) i--;
  if (i < 0) return `<${edges[0]}`;
  return i === edges.length - 1 ? `${edges[i]}+` : `${edges[i]}-${edges[i + 1]! - 1}`;
}

// Pars run from about 8 (easy) to 40 (hard), and lessons take under 10 moves.
const MOVES_EDGES = [1, 11, 21, 31, 41, 61];
export const MOVES_BUCKETS = MOVES_EDGES.map((e) => bucket(e, MOVES_EDGES));
/** A solve's move count (hints counted, as on screen), bucketed. */
export const movesBucket = (moves: number) => bucket(moves, MOVES_EDGES);

/** The allow-list for the puzzles there are: `day` is a daily's date or a lesson's id ("t1"). */
export function events(index: Index) {
  const day = [...index.daily.map((d) => d.date), ...index.tutorial.map((l) => String(l.id))];
  return {
    $pageview: {},
    play_started: { mode: MODES, day },
    play_finished: { mode: MODES, day, moves_bucket: MOVES_BUCKETS, hinted: [true, false] },
  } satisfies AllowList;
}

/** play_started and play_finished, each sent once per puzzle (`day`) per page load. `send` may throw. */
export function playEvents(send: (name: string, props: Props) => void) {
  const sent = new Set<string>();
  const once = (name: string, day: string, props: Props) => {
    const key = `${name} ${day}`;
    if (sent.has(key)) return;
    sent.add(key);
    try { send(name, props); } catch {}
  };
  return {
    started: (mode: Mode, day: string) => once("play_started", day, { mode, day }),
    finished: (mode: Mode, day: string, moves: number, hinted: boolean) =>
      once("play_finished", day, { mode, day, moves_bucket: movesBucket(moves), hinted }),
  };
}
