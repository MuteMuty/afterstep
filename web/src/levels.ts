// Loading levels (lab#40), kept free of the DOM so tests/levels.test.mjs can run
// it in Node. A request that fails (offline, a 404, a reply that isn't a level)
// gives null instead of throwing, and main.ts shows a message with Retry.

export type Level = {
  id: number | string;
  date?: string;
  tier?: string;
  name?: string;
  tip?: string;
  delay: number;
  par?: number;
  grid: string[];
};
export type DailyEntry = { id: number; date: string; tier: string; par: number };
export type Index = { daily: DailyEntry[]; tutorial: Level[] };

const isObject = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

/** Enough of a level to build a board from: rows of one length and an echo delay. */
export function isLevel(x: unknown): x is Level {
  if (!isObject(x)) return false;
  const { grid, delay } = x;
  return Array.isArray(grid) && grid.length > 0 &&
    grid.every((row) => typeof row === "string" && row.length > 0 && row.length === (grid[0] as string).length) &&
    typeof delay === "number" && Number.isInteger(delay) && delay > 0;
}

/** The index the build writes: the dailies there are, and the lessons. */
export function isIndex(x: unknown): x is Index {
  return isObject(x) && Array.isArray(x.daily) && Array.isArray(x.tutorial) &&
    x.daily.every((d) => isObject(d) && typeof d.date === "string") && x.tutorial.every(isLevel);
}

/** Fetch `url` as JSON that passes `ok`: the value, or null when the network
 *  fails, the server answers with an error, or the reply isn't what `ok` takes.
 *  Never throws or rejects. */
export async function fetchChecked<T>(fetch: (url: string) => Promise<Pick<Response, "ok" | "json">>, url: string, ok: (x: unknown) => x is T): Promise<T | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const x: unknown = await r.json();
    return ok(x) ? x : null;
  } catch {
    return null;
  }
}
