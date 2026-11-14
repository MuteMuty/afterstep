import "./style.css";
import init, { WasmGame } from "./wasm/afterstep_engine.js";
import { createLikes, LIKE_KEY, likeLabel, type LikeState } from "./likes";
import { parseRoute, routeHash, routeTitle, shareUrl, type Route } from "./route";
import { boardNews, boardState, type BoardState } from "./announce";
import { fetchChecked, isIndex, isLevel, type Index, type Level } from "./levels";
import {
  archiveParts, bestResult, countHint, hintText, hintsSeen, readSave, recordResult, resultLine, shareLine, total, winTitle,
  type Result,
} from "./score";

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
const playEl = document.querySelector<HTMLElement>(".play")!;
const solvedEl = $("solved");
const solvedText = $("solved-text");
const solvedActions = $("solved-actions");
const boardNewsEl = $("board-news");
const loadEl = $("load");
const loadText = $("load-text");
const retryButton = $<HTMLButtonElement>("retry");
const loadLive = $("load-live");

// ---------- persistence (per-browser only) ----------
// What's kept and how old saves read: see score.ts.
const SAVE_KEY = "afterstep:v1";
function loadSave() {
  let raw: string | null = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch {}
  return readSave(raw);
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
let isToday = false;
// Hints shown on this daily so far, each one a move in its result (lab#25).
// Saved per puzzle, so leaving, a reload and Start over keep them. Lessons don't count hints.
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
  // On the board's wrap, which sizes the board to the space left on short screens.
  board.parentElement!.style.setProperty("--cols", String(w));
  board.parentElement!.style.setProperty("--rows", String(h));
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
      const l = document.createElement("span");
      l.className = "door-l";
      l.textContent = c.toUpperCase();
      l.setAttribute("aria-hidden", "true");
      cell.append(l);
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

// The board as last announced; null after a load or Start over, which say nothing.
let lastBoard: BoardState | null = null;

function render() {
  if (!game) return;
  clearHint();
  const g = game;
  const open = g.open_doors();
  const player = g.player();
  const echo = g.echo();
  // Plates pressed, doors opening or closing and the echo appearing are read out
  // through the status line's live region (lab#9). Plain steps clear it, so the
  // same news later is read again.
  const now = boardState(tiles, player, echo, open);
  boardNewsEl.textContent = boardNews(lastBoard, now);
  lastBoard = now;
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
  renderMoves();
  renderSolved();
}

/** The move counter, with each hint on a daily counted as a move. */
function renderMoves() {
  if (!game) return;
  movesEl.innerHTML = `Moves <strong>${game.moves() + hintsUsed}</strong>${level.par ? ` of par ${level.par}` : ""}`;
}

// ---------- hints ----------
const MOVE_WORDS = ["move up", "move down", "move left", "move right", "wait a turn"];
// The history the hint on screen was computed for, so a second press there isn't counted twice.
let hintShownFor: string | null = null;
// The first hint at the start of a puzzle is a nudge about its idea, not a move. It
// never counts. Opening a puzzle (also by a reload, or leaving and returning) and
// Start over each make the next first press the nudge again (lab#29).
let nudged = false;
// Takes the "Undo N moves?" offer while it shows (its link, or U); null otherwise.
let takeUndoOffer: (() => void) | null = null;

function clearHint() {
  hintShownFor = null;
  takeUndoOffer = null;
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
 *  winnable position is a nudge about the idea instead. On a daily each move hint
 *  counts as a move (the nudge and the undo offer don't). */
function showHint() {
  if (!game || loading || win.open) return;
  if (solved || game.won()) return nudgeSolved();
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
    if (mode === "daily") {
      hintsUsed = countHint(save, level.date!);
      persist();
      renderMoves();
    }
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
    undo.setAttribute("aria-keyshortcuts", "U");
    const take = () => {
      if (loading) return;
      for (let i = 0; i < n; i++) g.undo();
      render();
      board.focus({ preventScroll: true });
    };
    undo.onclick = take;
    // Named for keyboards only: touch screens hide it, like the keys hint.
    const key = document.createElement("span");
    key.className = "hint-key";
    key.textContent = " Press U";
    note("Can't win from here. ", undo, key);
    takeUndoOffer = take;
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
  if (!game || loading || win.open) return;
  if (solved || game.won()) return nudgeSolved();
  if (!game.step(a)) {
    bump(els.player);
    return;
  }
  if (game.echo_blocked_last()) bump(els.echo);
  render();
  if (game.won()) {
    const g = game, token = screenToken;
    // Only celebrate if the same game is still on screen (the player may have
    // navigated away, or another puzzle may be on its way).
    setTimeout(() => { if (game === g && token === screenToken && !loading && g.won()) onWin(); }, 160);
  }
}

// ---------- solved ----------
// The result on screen once a puzzle is solved: the win just made (as the win
// dialog shows it), or the saved best when a solved daily is opened again. The
// dialog, the solved line and the copied result all read it. Null while playing;
// Undo and Start over clear it.
let solved: Result | null = null;

/** Where Next goes: the next lesson, today's puzzle after the last one, or Past puzzles. */
function nextLabel(): string {
  if (mode === "daily") return "Past puzzles";
  return tutorialStep + 1 < index.tutorial.length ? "Next lesson" : "Play today's puzzle";
}

// The d-pad comes back where the solved line's Next was, so a fast double-tap
// on Next could land its second tap on a d-pad button: ignore d-pad presses
// for a moment after it reappears.
const DPAD_QUIET_MS = 400;
let dpadQuietUntil = 0;
let solvedShown = false;

/** The solved line, once the win dialog has closed: the result in the status
 *  line's place and the dialog's Copy result and Next in the place of the keys
 *  hint (or the d-pad, which can't move anything now), so the page never grows. */
function renderSolved() {
  const shown = !!solved && !win.open;
  if (solvedShown && !shown) dpadQuietUntil = performance.now() + DPAD_QUIET_MS;
  solvedShown = shown;
  playEl.classList.toggle("is-solved", shown);
  solvedActions.hidden = !shown;
  const text = shown && solved ? resultLine(solved, level.par) : "";
  if (solvedText.textContent !== text) solvedText.textContent = text;
  $("solved-share").hidden = mode === "learn";
  $("solved-next").textContent = nextLabel();
}

/** Keys on a solved board: nudge the solved line instead of doing nothing. */
function nudgeSolved() {
  if (solved) bump(solvedEl);
}

function onWin() {
  if (!game) return;
  const moves = game.moves();
  solved = { moves, hints: hintsUsed };
  const par = level.par ?? moves;
  if (mode === "learn") {
    $("win-title").textContent = "Nice";
    $("win-body").textContent = tutorialStep + 1 < index.tutorial.length
      ? `Solved in ${moves} moves.`
      : "You know everything you need. Today's puzzle is waiting.";
    $("share").hidden = true;
  } else {
    // A hinted solve counts for the streak; it replaces the saved best only if it beats it.
    recordResult(save, level.date!, solved);
    persist();
    $("win-title").textContent = winTitle(solved, par);
    const s = streak();
    $("win-body").textContent =
      `Puzzle ${level.id} in ${total(solved)} moves${hintText(solved.hints)}. Par is ${par}.` + (s > 1 ? ` You're on a ${s}-day streak.` : "");
    $("share").hidden = false;
  }
  $("next").textContent = nextLabel();
  showWinLike();
  // The solved line waits behind the dialog and shows once it closes.
  win.showModal();
  renderSolved();
}

function loadLevel(l: Level) {
  level = l;
  game?.free();
  game = new WasmGame(l.grid.join("\n"), l.delay);
  hintsUsed = mode === "daily" ? hintsSeen(save, l.date!) : 0;
  // Hints already counted stay counted (lab#25), but the nudge comes first again.
  nudged = false;
  // A daily solved before in this browser opens solved, from its saved best.
  solved = mode === "daily" ? bestResult(save, l.date!) : null;
  lastBoard = null;
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

// Bumps on every screen change, so a puzzle that loads after the visitor has
// moved on (Back, Forward, another click) is dropped.
let screenToken = 0;

// ---------- loading (lab#40) ----------
// While a puzzle is on its way the screen before it stays up, but game keys,
// swipes, the d-pad, Undo, Start over and Hint do nothing to it (and nudge
// nothing). A load that takes longer than LOAD_NOTE_MS says so, so a fast one
// never flashes a message; one that fails (offline, a 404, not a level) says so
// with Retry, and Back and the nav still work.
const LOAD_NOTE_MS = 600;
let loading = false;
let loadTimer = 0;

/** A new screen: whatever was loading for the old one is dropped. Gives the new screen's token. */
function newScreen(): number {
  loading = false;
  clearTimeout(loadTimer);
  return ++screenToken;
}

/** Start loading for the screen `token`: game input stops now, and a note shows if it's slow. */
function startLoad(token: number) {
  loading = true;
  // Cleared, so a failure that repeats after Retry is read out again.
  loadLive.textContent = "";
  clearTimeout(loadTimer);
  loadTimer = window.setTimeout(() => { if (token === screenToken) loadNote("Loading the puzzle…"); }, LOAD_NOTE_MS);
}

function endLoad() {
  loading = false;
  clearTimeout(loadTimer);
}

/** The loading screen, in the place of the play screen or Past puzzles: `text`,
 *  read out politely, and Retry when `retry` is given. */
function loadNote(text: string, retry?: () => void) {
  const again = !loadEl.hidden && !retryButton.hidden && loadText.textContent === text;
  show("load");
  loadText.textContent = text;
  loadLive.textContent = text;
  retryButton.hidden = !retry;
  retryButton.onclick = retry ?? null;
  if (!retry) return;
  // Retry that failed again shakes the message, so the press shows it was tried.
  if (again) bump(loadText);
  // Focus that was on the screen just hidden goes to Retry; focus on the nav stays.
  const a = document.activeElement;
  if (!a || a === document.body || a.closest("[hidden]")) retryButton.focus({ preventScroll: true });
}

function loadFailed(text: string, retry: () => void) {
  endLoad();
  loadNote(text, retry);
}

async function openDaily(date?: string) {
  const token = newScreen();
  if (!save.learned) { save.learned = true; persist(); }
  const today = localDate();
  const avail = index.daily.filter((d) => d.date <= today);
  const entry = (date && avail.find((d) => d.date === date)) || avail[avail.length - 1] || index.daily[0];
  startLoad(token);
  const l = await fetchChecked((u) => fetch(u), `/levels/daily/${entry.date}.json`, isLevel);
  if (token !== screenToken) return;
  if (!l) {
    loadFailed("This puzzle didn't load. Check your connection and try again.", () => openDaily(date));
    setNav(entry.date === today ? "today" : "archive");
    return;
  }
  endLoad();
  mode = "daily";
  show("play");
  isToday = entry.date === today;
  loadLevel(l);
  setNav(isToday ? "today" : "archive");
}

function openLearn(step = 0) {
  newScreen();
  mode = "learn";
  tutorialStep = step;
  show("play");
  loadLevel(index.tutorial[step]);
  setNav("learn");
}

function openArchive() {
  newScreen();
  const today = localDate();
  const list = $("archive-list");
  list.replaceChildren(
    ...index.daily
      .filter((d) => d.date <= today)
      .reverse()
      .map((d) => {
        const li = document.createElement("li");
        const b = document.createElement("button");
        const best = bestResult(save, d.date);
        b.innerHTML = `<span>Puzzle ${d.id} <span class="meta">${prettyDate(d.date)}</span></span>` +
          `<span class="meta">${TIER[d.tier]}${best ? `, <span class="done">${archiveParts(best).map((t) => `<span>${t}</span>`).join(" ")}</span>` : ""}</span>`;
        b.onclick = () => go({ kind: "puzzle", date: d.date });
        li.append(b);
        return li;
      }),
  );
  show("archive");
  setNav("archive");
}

function show(which: "play" | "archive" | "load") {
  playEl.hidden = which !== "play";
  $("archive").hidden = which !== "archive";
  loadEl.hidden = which !== "load";
}

// ---------- routes (lab#8) ----------
// Each screen has its own URL (see route.ts): changing screen pushes a history
// entry, so Back, Forward, reload and shared links work. Moves never do.
let shownUrl = "";
const currentPath = () => location.href.slice(location.origin.length);

function routeContext() {
  return { today: localDate(), dates: index.daily.map((d) => d.date), lessons: index.tutorial.length };
}

/** Put the route in the address bar and the title, adding a history entry only for "push". */
function setUrl(r: Route, how: "push" | "replace") {
  const url = location.pathname + location.search + routeHash(r);
  if (url !== currentPath()) history[how === "push" ? "pushState" : "replaceState"](null, "", url);
  shownUrl = location.href;
  document.title = routeTitle(r);
}

function openRoute(r: Route) {
  if (win.open) win.close();
  // Afterstep itself didn't load (or hasn't yet): loading it opens the route.
  if (!index) return void boot();
  if (r.kind === "today") openDaily();
  else if (r.kind === "puzzle") openDaily(r.date);
  else if (r.kind === "learn") openLearn(r.step);
  else openArchive();
}

/** The visitor changes screen. */
function go(r: Route) {
  setUrl(r, "push");
  openRoute(r);
}

/** Show the screen the address bar names (on load, Back and Forward). A
 *  newcomer's home page is the first lesson; a link to a puzzle that isn't out,
 *  a malformed one or an unknown route opens today's puzzle. Either way the URL
 *  is replaced, not added to. */
function fromLocation() {
  if (!index || location.href === shownUrl) return;
  const asked = parseRoute(location.hash, routeContext());
  const r: Route = !asked ? { kind: "today" } : asked.kind === "today" && !save.learned ? { kind: "learn", step: 0 } : asked;
  setUrl(r, "replace");
  openRoute(r);
}
window.addEventListener("popstate", fromLocation);
window.addEventListener("hashchange", fromLocation);

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
    undo();
  } else if (e.code === "KeyR") {
    restart();
  } else if (e.code === "KeyH") {
    showHint();
  } else if (e.code === "KeyU" && takeUndoOffer) {
    // U takes Hint's undo offer, and does nothing while none shows.
    e.preventDefault();
    takeUndoOffer();
  }
});

// Some touch screens report a fine pointer, which the stylesheet takes for a
// mouse. The first touch shows the d-pad and hides the keys hint there too.
addEventListener("pointerdown", (e) => {
  if (e.pointerType === "touch") document.documentElement.classList.add("touch");
}, { capture: true, passive: true });

let touch: { x: number; y: number } | null = null;
board.addEventListener("pointerdown", (e) => { touch = { x: e.clientX, y: e.clientY }; });
board.addEventListener("pointerup", (e) => {
  if (!touch) return;
  const dx = e.clientX - touch.x, dy = e.clientY - touch.y;
  touch = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
  act(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? RIGHT : LEFT) : dy > 0 ? DOWN : UP);
});
/** Undo a move. On a solved board it also leaves the solved state, even when
 *  there's no move to undo (a solved daily opened again starts at move 0). */
function undo() {
  if (!game || loading) return;
  const wasSolved = !!solved;
  if (game.undo() || wasSolved) {
    solved = null;
    render();
  }
}
function restart() {
  if (!game || loading) return;
  game.reset();
  // Back at the start, the next first press is the free nudge again. Hints
  // already counted stay counted (lab#25).
  nudged = false;
  solved = null;
  lastBoard = null;
  render();
}

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
  control(b, () => { if (performance.now() >= dpadQuietUntil) act(Number(b.dataset.move)); });
});
control($("wait"), () => act(WAIT));
control($("undo"), undo);
control($("restart"), restart);
control($("hint"), showHint);
document.querySelectorAll<HTMLButtonElement>("[data-nav]").forEach((b) => {
  b.onclick = () => {
    if (b.dataset.nav === "today") go({ kind: "today" });
    else if (b.dataset.nav === "learn") go({ kind: "learn", step: 0 });
    else go({ kind: "past" });
  };
});
document.querySelector<HTMLAnchorElement>(".brand")!.onclick = (e) => { e.preventDefault(); go({ kind: "today" }); };

// The win dialog and the solved line share their Next and Copy result.
function next() {
  win.close();
  if (mode === "learn") {
    if (tutorialStep + 1 < index.tutorial.length) go({ kind: "learn", step: tutorialStep + 1 });
    else {
      save.learned = true;
      persist();
      go({ kind: "today" });
    }
  } else go({ kind: "past" });
}
async function copyResult(button: HTMLElement) {
  if (!solved) return;
  // Today's result links to the home page; an older puzzle's to that puzzle.
  const text = `${shareLine(level.id, solved, level.par ?? 0)}\n${shareUrl(level.date!, localDate())}`;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = "Copied";
  } catch {
    button.textContent = "Copy failed";
  }
  setTimeout(() => (button.textContent = "Copy result"), 1600);
}
$("next").onclick = next;
$("solved-next").onclick = next;
$("share").onclick = () => copyResult($("share"));
$("solved-share").onclick = () => copyResult($("solved-share"));
// The solved line appears once the dialog closes (unless Next moved on), when the
// page is no longer inert, so its status region announces it then.
win.addEventListener("close", renderSolved);

// ---------- likes (lab#17) ----------
// A heart with the live count from the lab hub: a quiet one at the start of the
// footer line, and one in a daily's win dialog. Both stay hidden until the counts
// load, and the game never waits for them. See likes.ts.
const likeButtons = [$<HTMLButtonElement>("like-foot"), $<HTMLButtonElement>("like-win")];
const winLike = $("win-like");
const likeLive = $("like-live");
let likeNoteTimer = 0;
let likeNoteFor: HTMLElement | null = null;
let storage: Storage | null = null;
try { storage = window.localStorage; } catch {}

const likes = createLikes({
  fetch: (...a) => fetch(...a),
  storage,
  api: "https://lab.brightloopapps.com",
  project: "afterstep",
  onChange: renderLikes,
});
// Another tab liked or unliked (or its storage was cleared): show it here too (lab#37).
addEventListener("storage", (e) => {
  if (e.storageArea === storage && (e.key === LIKE_KEY || e.key === null)) likes.sync();
});

function renderLikes(s: LikeState) {
  for (const b of likeButtons) {
    b.hidden = !s.ready;
    b.setAttribute("aria-pressed", String(s.liked));
    b.setAttribute("aria-label", likeLabel(s.count));
    if (s.busy) b.setAttribute("aria-busy", "true");
    else b.removeAttribute("aria-busy");
    b.querySelector(".like-n")!.textContent = String(s.count);
  }
  showWinLike();
  // A note shows by the button that was pressed, and is read out politely.
  const notes = document.querySelectorAll<HTMLElement>(".like-note");
  clearTimeout(likeNoteTimer);
  notes.forEach((n) => {
    n.hidden = !s.note || n !== likeNoteFor;
    n.textContent = n.hidden ? "" : s.note;
  });
  likeLive.textContent = s.note;
  if (s.note) likeNoteTimer = window.setTimeout(() => notes.forEach((n) => (n.hidden = true)), 6000);
}

/** The win dialog asks on a daily, once the counts are in. */
function showWinLike() {
  winLike.hidden = !likes.state.ready || mode !== "daily";
  $("win-like-ask").textContent = isToday ? "Enjoyed today's puzzle?" : "Enjoyed this puzzle?";
}

function pop(b: HTMLElement) {
  b.classList.remove("pop");
  void b.offsetWidth;
  b.classList.add("pop");
}
likeButtons.forEach((b, i) => {
  const note = document.querySelectorAll<HTMLElement>(i === 0 ? ".foot-like-note" : ".win-like-note")[0];
  const press = () => {
    likeNoteFor = note;
    if (!likes.state.liked) pop(b);
    likes.toggle();
  };
  // The footer's heart is pressed during play: after a mouse or touch press, focus
  // goes back to the board like the game controls'. The dialog's keeps its focus.
  if (i === 0) control(b, press);
  else b.onclick = press;
});

// ---------- boot ----------
// The index (dailies and lessons) and the engine. If either doesn't load, the
// loading screen offers Retry, as for a puzzle (lab#40).
let engine: Promise<boolean> | null = null;
function loadEngine(): Promise<boolean> {
  engine ??= init().then(() => true, () => { engine = null; return false; });
  return engine;
}
let booting = false;
let likesLoaded = false;
async function boot() {
  if (booting) return;
  booting = true;
  startLoad(newScreen());
  const [got, ready] = await Promise.all([fetchChecked((u) => fetch(u), "/levels/index.json", isIndex), loadEngine()]);
  booting = false;
  if (!got || !ready) return loadFailed("Afterstep didn't load. Check your connection and try again.", boot);
  endLoad();
  index = got;
  // Open whatever the address bar names now, also if a nav button changed it meanwhile.
  shownUrl = "";
  fromLocation();
  // Counts load after the first puzzle is on screen; nothing waits for them.
  if (!likesLoaded) {
    likesLoaded = true;
    likes.load();
  }
}
board.tabIndex = 0;
boot();
