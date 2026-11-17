// What the board says to screen readers (lab#9): plates pressed, doors opening
// and closing, the echo appearing, and the echo bumping into a door (lab#42).
// Ordinary steps say nothing, and a plate held down is announced once. No DOM:
// main.ts reads the game into a BoardState after every change and puts
// boardNews into the news live region.

export type Who = "you" | "echo" | "both";

export type BoardState = {
  /** Who stands on a plate of each letter (A–H but E, the exit); letters nobody holds are left out. */
  plates: Record<string, Who>;
  /** Whether each letter's doors are open, for the letters that have doors. */
  doors: Record<string, boolean>;
  /** Whether the echo is on the board. */
  echo: boolean;
};

const letter = (c: string) => c.toUpperCase();
const bitOf = (c: string) => 1 << (c.toLowerCase().charCodeAt(0) - 97);

/** Read the board: `tiles` as in the level grid, positions as cell indexes (echo -1
 *  before it appears), `open` the engine's open-doors bitmask. A door someone stands
 *  in stays open, as the board draws it. */
export function boardState(tiles: string[], player: number, echo: number, open: number): BoardState {
  const plates: Record<string, Who> = {};
  const doors: Record<string, boolean> = {};
  tiles.forEach((c, i) => {
    // E is the exit, never a plate.
    if (c >= "A" && c <= "H" && c !== "E") {
      const who: Who | null = i === player && i === echo ? "both" : i === player ? "you" : i === echo ? "echo" : null;
      const had = plates[c];
      if (who) plates[c] = had && had !== who ? "both" : who;
    } else if (c >= "a" && c <= "h") {
      const L = letter(c);
      doors[L] = !!doors[L] || (open & bitOf(c)) !== 0 || i === player || i === echo;
    }
  });
  return { plates, doors, echo: echo >= 0 };
}

const PRESS: Record<Who, string> = { you: "You press", echo: "The echo presses", both: "You and the echo press" };

/** What changed from `before` to `after`, as one or more short sentences, or ""
 *  when nothing worth saying did. `bump` (from echoBump) is said first, when the
 *  echo bumped on this step. `before` null (a new board) says nothing. */
export function boardNews(before: BoardState | null, after: BoardState, bump = ""): string {
  if (!before) return "";
  const out: string[] = bump ? [bump] : [];
  if (after.echo && !before.echo) out.push("Your echo appears.");
  for (const L of Object.keys(after.plates).sort()) {
    if (!before.plates[L]) out.push(`${PRESS[after.plates[L]]} plate ${L}.`);
  }
  for (const L of Object.keys(after.doors).sort()) {
    if (after.doors[L] !== !!before.doors[L]) out.push(`Door ${L} ${after.doors[L] ? "opens" : "closes"}.`);
  }
  return out.join(" ");
}

const STEP: Record<string, [number, number]> = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };

/** What to say when the echo bumps: it tried to replay `move` (U, D, L or R) from
 *  cell `from` on a board `width` cells wide and stayed put, so it fell out of
 *  step. A closed door is named; anything else stopping it is a wall. */
export function echoBump(tiles: string[], width: number, from: number, move: string): string {
  const [dx, dy] = STEP[move];
  const x = (from % width) + dx, y = Math.floor(from / width) + dy;
  const c = x >= 0 && x < width && y >= 0 ? tiles[y * width + x] ?? "#" : "#";
  return c >= "a" && c <= "h" ? `The echo bumps into door ${letter(c)}.` : "The echo bumps into a wall.";
}
