import "./style.css";
import init, { WasmGame } from "./wasm/afterstep_engine.js";

type Level = {
  id: number | string;
  date?: string;
  tier?: string;
  name?: string;
  tip?: string;
  delay: number;
  par?: number;
  grid: string[];
};
type DailyEntry = { id: number; date: string; tier: string; par: number };
type Index = { daily: DailyEntry[]; tutorial: Level[] };
type Save = { learned: boolean; results: Record<string, number> };

const UP = 0, DOWN = 1, LEFT = 2, RIGHT = 3, WAIT = 4;
const DELTA: Record<number, [number, number]> = { 0: [0, -1], 1: [0, 1], 2: [-1, 0], 3: [1, 0], 4: [0, 0] };
const TIER: Record<string, string> = { easy: "Gentle", medium: "Tricky", hard: "Devious" };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const board = $("board");
const title = $("level-title");
const sub = $("level-sub");
const tip = $("tip");
const echoStatus = $("echo-status");
const movesEl = $("moves");
const win = $<HTMLDialogElement>("win");
const statusEl = document.querySelector<HTMLElement>(".status")!;
const hintNote = $("hint-note");

// ---------- persistence (per-browser only) ----------
const SAVE_KEY = "afterstep:v1";
function loadSave(): Save {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || "");
    if (s && typeof s === "object") return { learned: !!s.learned, results: s.results || {} };
  } catch {}
  return { learned: false, results: {} };
}
const save = loadSave();
function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {}
}

function localDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}
function streak(): number {
  let n = 0;
  const d = new Date();
  if (!save.results[localDate(d)]) d.setDate(d.getDate() - 1);
  while (save.results[localDate(d)]) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

// ---------- state ----------
let index: Index;
let level: Level;
let mode: "daily" | "learn" = "daily";
// Today's daily counts hints in its result; lessons and past puzzles don't.
let isToday = false;
let hintsUsed = 0;
let tutorialStep = 0;
let game: WasmGame | null = null;
let w = 0, h = 0, start = 0;
let tiles: string[] = [];
const els: { cells: HTMLElement[]; player: HTMLElement; echo: HTMLElement; spawn: HTMLElement; hint: HTMLElement; prints: HTMLElement[] } = {
  cells: [], player: document.createElement("div"), echo: document.createElement("div"),
  spawn: document.createElement("div"), hint: document.createElement("div"), prints: [],
};

function place(el: HTMLElement, pos: number) {
  el.style.setProperty("--x", String(pos % w));
  el.style.setProperty("--y", String(Math.floor(pos / w)));
}

function letterOf(c: string): number {
  return c.toLowerCase().charCodeAt(0) - 97;
}

function buildBoard() {
  w = level.grid[0].length;
  h = level.grid.length;
  tiles = level.grid.join("").split("");
  start = tiles.indexOf("S");
  board.style.setProperty("--cols", String(w));
  board.style.setProperty("--rows", String(h));
  board.replaceChildren();
  els.cells = tiles.map((c) => {
    const cell = document.createElement("div");
    cell.className = "cell";
    if (c === "#") cell.classList.add("wall");
    else if (c === "E") cell.classList.add("exit");
    else if (c >= "A" && c <= "H") {
      cell.classList.add("plate");
      cell.dataset.l = c;
      cell.style.setProperty("--c", `var(--l${letterOf(c) % 4})`);
    } else if (c >= "a" && c <= "h") {
      cell.classList.add("door");
      cell.style.setProperty("--c", `var(--l${letterOf(c) % 4})`);
    }
    board.append(cell);
    return cell;
  });
  els.prints = Array.from({ length: level.delay }, (_, i) => {
    const p = document.createElement("div");
    p.className = "foot-print";
    p.style.setProperty("--i", String(i));
    board.append(p);
    return p;
  });
  els.spawn.className = "spawn";
  els.echo.className = "piece echo";
  els.player.className = "piece player";
  els.hint.className = "hint-mark";
  els.hint.hidden = true;
  board.append(els.spawn, els.hint, els.echo, els.player);
}

function passableNow(pos: number, open: number): boolean {
  const c = tiles[pos];
  if (c === "#") return false;
  if (c >= "a" && c <= "h") return (open & (1 << letterOf(c))) !== 0;
  return true;
}

/** Where the echo will walk next, assuming doors stay as they are now. */
function predictEcho(g: WasmGame): { pos: number; inMoves: number }[] {
  const hist = g.history();
  const k = level.delay;
  const open = g.open_doors();
  const out: { pos: number; inMoves: number }[] = [];
  const echo = g.echo();
  let pos = echo >= 0 ? echo : start;
  const actions = echo >= 0 ? hist.slice(hist.length - k) : hist;
  const offset = echo >= 0 ? 0 : g.echo_in();
  for (let i = 0; i < actions.length; i++) {
    const a = "UDLR.".indexOf(actions[i]);
    const [dx, dy] = DELTA[a];
    const x = (pos % w) + dx, y = Math.floor(pos / w) + dy;
    if (x >= 0 && y >= 0 && x < w && y < h && passableNow(y * w + x, open)) pos = y * w + x;
    out.push({ pos, inMoves: offset + i + 1 });
  }
  return out;
}

function render() {
  if (!game) return;
  clearHint();
  const g = game;
  const open = g.open_doors();
  const player = g.player();
  const echo = g.echo();
  tiles.forEach((c, i) => {
    if (c >= "a" && c <= "h") els.cells[i].classList.toggle("open", (open & (1 << letterOf(c))) !== 0 || i === player || i === echo);
    if (c >= "A" && c <= "H") els.cells[i].classList.toggle("pressed", (open & (1 << letterOf(c))) !== 0);
  });
  place(els.player, player);
  els.echo.hidden = echo < 0;
  if (echo >= 0) place(els.echo, echo);
  const echoIn = g.echo_in();
  els.spawn.hidden = echoIn === 0;
  if (echoIn > 0) {
    place(els.spawn, start);
    els.spawn.dataset.n = String(echoIn);
  }
  const preds = predictEcho(g);
  els.prints.forEach((p, i) => {
    const pr = preds[i];
    // Only show footprints for steps that actually move somewhere new.
    const prev = i === 0 ? (echo >= 0 ? echo : start) : preds[i - 1]?.pos;
    p.hidden = !pr || pr.pos === prev || pr.pos === player;
    if (pr) {
      place(p, pr.pos);
      p.dataset.n = String(pr.inMoves);
    }
  });
  echoStatus.innerHTML = echoIn > 0
    ? `Echo appears in <strong>${echoIn}</strong>`
    : `Echo follows <strong>${level.delay}</strong> moves behind`;
  movesEl.innerHTML = `Moves <strong>${g.moves()}</strong>${level.par ? ` of par ${level.par}` : ""}`;
}

// ---------- hints ----------
const MOVE_WORDS = ["move up", "move down", "move left", "move right", "wait a turn"];
// The history the hint on screen was computed for, so a second press there isn't counted twice.
let hintShownFor: string | null = null;
// The first hint on a puzzle is a nudge about its idea, not a move. It never counts.
let nudged = false;

function clearHint() {
  hintShownFor = null;
  els.hint.hidden = true;
  hintNote.hidden = true;
  hintNote.replaceChildren();
  statusEl.classList.remove("hinting");
  document.querySelectorAll(".hinted").forEach((b) => b.classList.remove("hinted"));
}

function note(...parts: (string | Node)[]) {
  hintNote.replaceChildren(...parts);
  hintNote.hidden = false;
  statusEl.classList.add("hinting");
}

/** Show the next move of a shortest win from here, or offer to undo back to
 *  the last position that can still be won. The first hint on a puzzle from a
 *  winnable position is a nudge about the idea instead. Hints never count as moves. */
function showHint() {
  if (!game || game.won() || win.open) return;
  const g = game;
  const here = g.history();
  if (hintShownFor === here) return;
  const h = g.hint();
  clearHint();
  if (h >= 0 && h <= WAIT && !nudged) {
    nudged = true;
    note(g.nudge());
  } else if (h >= 0 && h <= WAIT) {
    hintShownFor = here;
    hintsUsed++;
    const [dx, dy] = DELTA[h];
    const p = g.player();
    place(els.hint, p + dy * w + dx);
    els.hint.dataset.hint = String(h);
    els.hint.hidden = false;
    (h === WAIT ? $("wait") : document.querySelector(`.dpad [data-move="${h}"]`))?.classList.add("hinted");
    note(`Hint: ${MOVE_WORDS[h]}.`);
  } else if (h < 0) {
    const n = -h;
    const undo = document.createElement("button");
    undo.className = "link";
    undo.textContent = `Undo ${n} ${n === 1 ? "move" : "moves"}?`;
    undo.onclick = () => {
      for (let i = 0; i < n; i++) g.undo();
      render();
      board.focus({ preventScroll: true });
    };
    note("You can't win from here. ", undo);
  } else if (h === 6) {
    note("No hint found from here.");
  }
}

function bump(el: HTMLElement) {
  el.classList.remove("bump");
  void el.offsetWidth;
  el.classList.add("bump");
}

function act(a: number) {
  if (!game || game.won() || win.open) return;
  if (!game.step(a)) {
    bump(els.player);
    return;
  }
  if (game.echo_blocked_last()) bump(els.echo);
  render();
  if (game.won()) {
    const g = game;
    // Only celebrate if the same game is still on screen (the player may have navigated away).
    setTimeout(() => { if (game === g && g.won()) onWin(); }, 160);
  }
}

// Move and hint counts shown in the win dialog; the share text uses them, not live state.
let winMoves = 0;
let winHints = 0;

/** " with 2 hints" on today's daily when any were used, otherwise "". */
function hintText(n: number): string {
  return n > 0 ? ` with ${n} ${n === 1 ? "hint" : "hints"}` : "";
}

function onWin() {
  if (!game) return;
  const moves = (winMoves = game.moves());
  winHints = mode === "daily" && isToday ? hintsUsed : 0;
  const par = level.par ?? moves;
  if (mode === "learn") {
    $("win-title").textContent = "Nice";
    $("win-body").textContent = tutorialStep + 1 < index.tutorial.length
      ? `Solved in ${moves} moves.`
      : "You know everything you need. Today's puzzle is waiting.";
    $("share").hidden = true;
    $("next").textContent = tutorialStep + 1 < index.tutorial.length ? "Next lesson" : "Play today's puzzle";
  } else {
    const key = level.date!;
    const best = save.results[key];
    if (!best || moves < best) save.results[key] = moves;
    persist();
    $("win-title").textContent = moves <= par ? "Perfect" : "Solved";
    const s = streak();
    $("win-body").textContent =
      `Puzzle ${level.id} in ${moves} moves${hintText(winHints)}. Par is ${par}.` + (s > 1 ? ` You're on a ${s}-day streak.` : "");
    $("share").hidden = false;
    $("next").textContent = "Past puzzles";
  }
  win.showModal();
}

function loadLevel(l: Level) {
  level = l;
  game?.free();
  game = new WasmGame(l.grid.join("\n"), l.delay);
  hintsUsed = 0;
  nudged = false;
  buildBoard();
  if (mode === "learn") {
    title.textContent = l.name ?? "Lesson";
    sub.textContent = `Lesson ${tutorialStep + 1} of ${index.tutorial.length}`;
    tip.textContent = l.tip ?? "";
    tip.hidden = !l.tip;
  } else {
    title.textContent = `Puzzle ${l.id}`;
    sub.textContent = `${prettyDate(l.date!)}, ${TIER[l.tier ?? "medium"].toLowerCase()}`;
    tip.hidden = true;
  }
  render();
  board.focus({ preventScroll: true });
}

async function openDaily(date?: string) {
  mode = "daily";
  if (!save.learned) { save.learned = true; persist(); }
  const today = localDate();
  const avail = index.daily.filter((d) => d.date <= today);
  const entry = (date && avail.find((d) => d.date === date)) || avail[avail.length - 1] || index.daily[0];
  const l: Level = await fetch(`/levels/daily/${entry.date}.json`).then((r) => r.json());
  show("play");
  isToday = entry.date === today;
  loadLevel(l);
  setNav(isToday ? "today" : "archive");
}

function openLearn(step = 0) {
  mode = "learn";
  tutorialStep = step;
  show("play");
  loadLevel(index.tutorial[step]);
  setNav("learn");
}

function openArchive() {
  const today = localDate();
  const list = $("archive-list");
  list.replaceChildren(
    ...index.daily
      .filter((d) => d.date <= today)
      .reverse()
      .map((d) => {
        const li = document.createElement("li");
        const b = document.createElement("button");
        const best = save.results[d.date];
        b.innerHTML = `<span>Puzzle ${d.id} <span class="meta">${prettyDate(d.date)}</span></span>` +
          `<span class="meta">${TIER[d.tier]}${best ? `, <span class="done">solved in ${best}</span>` : ""}</span>`;
        b.onclick = () => openDaily(d.date);
        li.append(b);
        return li;
      }),
  );
  show("archive");
  setNav("archive");
}

function show(which: "play" | "archive") {
  document.querySelector<HTMLElement>(".play")!.hidden = which !== "play";
  $("archive").hidden = which !== "archive";
}

function setNav(which: string) {
  document.querySelectorAll<HTMLButtonElement>("[data-nav]").forEach((b) => {
    if (b.dataset.nav === which) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
}

// ---------- input ----------
const KEYS: Record<string, number> = {
  ArrowUp: UP, KeyW: UP, ArrowDown: DOWN, KeyS: DOWN, ArrowLeft: LEFT, KeyA: LEFT,
  ArrowRight: RIGHT, KeyD: RIGHT, Space: WAIT, Period: WAIT,
};
const CONTROLS = "button, a[href], input, select, textarea, summary, [role=button]";
window.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.querySelector<HTMLElement>(".play")!.hidden) return;
  // The win dialog owns the keyboard (Tab, Enter, Space, Escape) while it's open.
  if (win.open) return;
  // Space and Enter on a focused control do that control's own job.
  if ((e.code === "Space" || e.code === "Enter") && e.target instanceof Element && e.target.closest(CONTROLS)) return;
  if (e.code in KEYS) {
    e.preventDefault();
    act(KEYS[e.code]);
  } else if (e.code === "KeyZ" || e.code === "Backspace") {
    e.preventDefault();
    if (game?.undo()) render();
  } else if (e.code === "KeyR") {
    game?.reset();
    render();
  } else if (e.code === "KeyH") {
    showHint();
  }
});

let touch: { x: number; y: number } | null = null;
board.addEventListener("pointerdown", (e) => { touch = { x: e.clientX, y: e.clientY }; });
board.addEventListener("pointerup", (e) => {
  if (!touch) return;
  const dx = e.clientX - touch.x, dy = e.clientY - touch.y;
  touch = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
  act(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? RIGHT : LEFT) : dy > 0 ? DOWN : UP);
});
/** Run a game control's action. After a mouse, touch or pen press, focus goes
 *  back to the board so Space and the arrows play again; after a keyboard
 *  press (detail 0, no pointer type) it stays on the control. */
function control(b: HTMLElement, run: () => void) {
  b.onclick = (e) => {
    run();
    // Browsers whose click isn't a PointerEvent still report detail 0 for keys.
    const type = (e as PointerEvent).pointerType;
    const byPointer = type === undefined ? e.detail > 0 : type !== "";
    if (byPointer) board.focus({ preventScroll: true });
  };
}
document.querySelectorAll<HTMLButtonElement>("[data-move]").forEach((b) => {
  control(b, () => act(Number(b.dataset.move)));
});
control($("wait"), () => act(WAIT));
control($("undo"), () => { if (game?.undo()) render(); });
control($("restart"), () => { game?.reset(); render(); });
control($("hint"), showHint);
document.querySelectorAll<HTMLButtonElement>("[data-nav]").forEach((b) => {
  b.onclick = () => {
    if (b.dataset.nav === "today") openDaily();
    else if (b.dataset.nav === "learn") openLearn(0);
    else openArchive();
  };
});
document.querySelector<HTMLAnchorElement>(".brand")!.onclick = (e) => { e.preventDefault(); openDaily(); };

$("next").onclick = () => {
  win.close();
  if (mode === "learn") {
    if (tutorialStep + 1 < index.tutorial.length) openLearn(tutorialStep + 1);
    else {
      save.learned = true;
      persist();
      openDaily();
    }
  } else openArchive();
};
$("share").onclick = async () => {
  const moves = winMoves;
  const text = `Afterstep #${level.id}: ${moves} moves${hintText(winHints)} (par ${level.par})${moves <= (level.par ?? 0) ? " ★" : ""}\nhttps://afterstep.brightloopapps.com`;
  try {
    await navigator.clipboard.writeText(text);
    $("share").textContent = "Copied";
  } catch {
    $("share").textContent = "Copy failed";
  }
  setTimeout(() => ($("share").textContent = "Copy result"), 1600);
};

// ---------- boot ----------
(async () => {
  board.tabIndex = 0;
  [index] = await Promise.all([fetch("/levels/index.json").then((r) => r.json()), init()]);
  if (save.learned) openDaily();
  else openLearn(0);
})();
