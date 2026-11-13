// Afterstep's screens as hash routes (lab#8), kept free of the DOM so
// tests/route.test.mjs can run them in Node. Today's puzzle lives at the bare
// URL (old links keep working); everything else gets a hash:
//   #/learn/2              lesson 2 (lessons count from 1 in the URL)
//   #/past                 Past puzzles
//   #/puzzle/2026-11-10    one day's puzzle, once it's out

export type Route =
  | { kind: "today" }
  | { kind: "learn"; step: number }
  | { kind: "past" }
  | { kind: "puzzle"; date: string };

export type RouteContext = {
  /** Today's date in the visitor's time zone, YYYY-MM-DD. */
  today: string;
  /** Dates of the daily puzzles there are. */
  dates: string[];
  /** How many lessons there are. */
  lessons: number;
};

export const HOME_TITLE = "Afterstep: a daily puzzle where your past self holds the doors";
const SITE = "https://afterstep.brightloopapps.com";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A real calendar date written YYYY-MM-DD. */
function isDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/** The screen a location hash names, or null for an unknown route, a lesson
 *  that doesn't exist, or a puzzle that's malformed, missing or not out yet. */
export function parseRoute(hash: string, ctx: RouteContext): Route | null {
  if (hash === "" || hash === "#" || hash === "#/" || hash === "#/today") return { kind: "today" };
  if (hash === "#/past") return { kind: "past" };
  let m = /^#\/learn\/([1-9]\d*)$/.exec(hash);
  if (m) {
    const n = Number(m[1]);
    return n <= ctx.lessons ? { kind: "learn", step: n - 1 } : null;
  }
  m = /^#\/puzzle\/(.+)$/.exec(hash);
  if (m) {
    const date = m[1];
    return isDate(date) && date <= ctx.today && ctx.dates.includes(date) ? { kind: "puzzle", date } : null;
  }
  return null;
}

/** The route's canonical hash: "" (the bare URL) for today's puzzle. */
export function routeHash(r: Route): string {
  switch (r.kind) {
    case "today": return "";
    case "learn": return `#/learn/${r.step + 1}`;
    case "past": return "#/past";
    case "puzzle": return `#/puzzle/${r.date}`;
  }
}

/** The document title for the route, e.g. "Afterstep · Lesson 2" or "Afterstep · 10 Nov". */
export function routeTitle(r: Route): string {
  switch (r.kind) {
    case "today": return HOME_TITLE;
    case "learn": return `Afterstep · Lesson ${r.step + 1}`;
    case "past": return "Afterstep · Past puzzles";
    case "puzzle": {
      const [, m, d] = r.date.split("-").map(Number);
      return `Afterstep · ${d} ${MONTHS[m - 1]}`;
    }
  }
}

/** The link in a copied result: the home page for today's puzzle, the puzzle itself for an older one. */
export function shareUrl(date: string, today: string): string {
  return date === today ? SITE : `${SITE}/#/puzzle/${date}`;
}
