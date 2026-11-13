// Afterstep playtest: plays lessons 1-2 and today's puzzle (with the solver's
// solution) in a real browser, at desktop-dark and phone-light sizes, and
// checks the keyboard-first start (board focus, ring, Tab order, click-then-key)
// on desktop and tapping the controls on a touch phone. Hint check: the first
// hint on each puzzle is a nudge about its idea (no move marked, not counted);
// follows hints through lessons 1-3, gets stuck in lesson 4 and takes the
// offered undo by mouse and then, after Hint by keyboard, with U (which does
// nothing while no offer shows; the offer fits one line at 390px), follows
// hints through lesson 5 (the echo bump), and checks the hint count on
// today's puzzle (and its absence on a past one). On the touch
// phone, today's nudge fits on one line. Lessons: all five are played in a row
// by keyboard (desktop, dark) and by tapping the d-pad (phone, light), checking
// "Lesson n of 5", where each win dialog leads, and that lesson 5 fits.
// Solved state: hidden while the win dialog is open; after it closes (Escape), a
// solved line with Copy result and Next stays (the result in the status line's
// place, the buttons in the keys hint's or d-pad's), keys nudge it, Tab reaches
// it, and Undo / Start over remove it; reopening a solved puzzle from Past
// puzzles shows it again from the saved best (an unsolved one doesn't). The page
// is no taller and the footer no lower than during play at 1280x900, 390x844
// and 390x844 touch, and a fast double-tap on Next can't move in the next lesson.
// Keys hint: from 320 to 480px without touch no line starts or ends with "·"
// and no phrase breaks; one line at 1280px; hidden on a touch phone.
//
// Usage: node tests/playtest.mjs <baseUrl>
// Env:   PLAYTEST_BROWSER  Chromium-based browser executable (default: Brave)
//        PLAYTEST_OUT      screenshot folder (default: ./playtest-out)
// Exit:  0 = pass, 1 = fail (reasons printed)
import { chromium } from "playwright";
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const base = process.argv[2];
if (!base) {
  console.error("usage: node tests/playtest.mjs <baseUrl>");
  process.exit(2);
}
const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = process.env.PLAYTEST_OUT || join(repo, "playtest-out");
const browserPath = process.env.PLAYTEST_BROWSER || "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
mkdirSync(out, { recursive: true });

const KEY = { U: "ArrowUp", D: "ArrowDown", L: "ArrowLeft", R: "ArrowRight", ".": "Space" };
const pad = (n) => String(n).padStart(2, "0");
const now = new Date();
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const level = JSON.parse(readFileSync(join(repo, "levels/daily", `${today}.json`), "utf8"));

const failures = [];
const fail = (msg) => failures.push(msg);
const dialogOpens = (page) => page.waitForSelector("dialog[open]", { timeout: 2500 }).then(() => true, () => false);

// The solved line below the board: its text and Next label, or null when hidden.
const solvedLine = (page) => page.evaluate(() => {
  const t = document.querySelector("#solved-text"), a = document.querySelector("#solved-actions");
  if (!t || !a) return null;
  if (a.hidden || !a.offsetParent) return t.textContent ? { text: t.textContent, actions: false } : null;
  return { text: t.textContent, actions: true, share: !document.querySelector("#solved-share").hidden, next: document.querySelector("#solved-next").textContent };
});
async function expectSolved(page, name, label, text, next, share = true) {
  // The line shows when the dialog's close event runs, a task after it closes.
  await page.waitForFunction(() => document.querySelector("#solved-actions")?.offsetParent, null, { timeout: 1000 }).catch(() => {});
  const got = await solvedLine(page);
  if (!got || !got.actions) return fail(`${name}: ${label}: the solved line should show with its buttons, got ${JSON.stringify(got)}`);
  if (got.text !== text) fail(`${name}: ${label}: solved line should say "${text}", says "${got.text}"`);
  if (got.next !== next) fail(`${name}: ${label}: solved line's Next should say "${next}", says "${got.next}"`);
  if (got.share !== share) fail(`${name}: ${label}: solved line ${share ? "should" : "should not"} offer Copy result`);
  const role = await page.getAttribute("#solved-text", "role");
  if (role !== "status") fail(`${name}: ${label}: the solved line should be announced (role ${role})`);
}
async function expectNoSolved(page, name, label) {
  const got = await solvedLine(page);
  if (got) fail(`${name}: ${label}: there should be no solved line, got ${JSON.stringify(got)}`);
}
// A game key on a solved board leaves the moves alone and visibly nudges the solved line.
async function expectCue(page, name, label, key) {
  const moves = async () => Number((await page.textContent("#moves")).match(/Moves\s*(\d+)/)?.[1]);
  const m0 = await moves();
  await page.keyboard.press(key);
  const cue = await page.evaluate(() => {
    const s = document.querySelector("#solved");
    const anim = [s, ...s.querySelectorAll("*")].map((e) => getComputedStyle(e).animationName).filter((n) => n !== "none");
    return { bumped: s.classList.contains("bump"), anim };
  });
  if ((await moves()) !== m0) fail(`${name}: ${label}: ${key} on a solved board changed the moves`);
  if (!cue.bumped || !cue.anim.length) fail(`${name}: ${label}: ${key} on a solved board should nudge the solved line (${JSON.stringify(cue)})`);
}
// Open a puzzle from Past puzzles and wait until it's on screen (its title may already match).
async function openPast(page, id) {
  await page.click('[data-nav="archive"]');
  await page.waitForSelector("#archive:not([hidden])");
  await page.evaluate((id) => [...document.querySelectorAll("#archive-list button")].find((b) => b.textContent.startsWith(`Puzzle ${id} `)).click(), id);
  await page.waitForFunction((id) => !document.querySelector(".play").hidden && document.querySelector("#level-title").textContent === `Puzzle ${id}`, id);
}
const stubClipboard = (page) => page.evaluate(() => {
  window.__copied = "";
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t) => { window.__copied = t; } } });
});

// Page height and footer position, to compare during play with solved.
const pageBox = (page) => page.evaluate(() => ({
  height: document.documentElement.scrollHeight,
  footer: Math.round(document.querySelector(".foot").getBoundingClientRect().top + window.scrollY),
}));
function expectSameBox(name, label, playing, solved) {
  if (solved.height > playing.height || solved.footer !== playing.footer)
    fail(`${name}: ${label}: the solved line should not grow the page or move the footer (during play ${JSON.stringify(playing)}, solved ${JSON.stringify(solved)})`);
  else console.log(`${name}: page ${solved.height}px, footer at ${solved.footer}px, same as during play`);
}

async function play(page, moves) {
  for (const m of moves) await page.keyboard.press(KEY[m]);
}

async function session(browser, name, viewport, colorScheme) {
  const page = await browser.newPage({ viewport, colorScheme });
  page.on("console", (m) => m.type() === "error" && fail(`${name}: console error: ${m.text()}`));
  page.on("pageerror", (e) => fail(`${name}: page error: ${e.message}`));
  const res = await page.goto(base, { waitUntil: "networkidle" }).catch((e) => fail(`${name}: could not load ${base}: ${e.message}`));
  if (!res) return page.close();
  if (!(await page.waitForSelector(".cell", { timeout: 8000 }).catch(() => null))) {
    fail(`${name}: board never rendered`);
    return page.close();
  }

  // Lesson 1, then lesson 2 (which needs the echo).
  if ((await page.textContent("#level-title")) !== "Plates open doors") fail(`${name}: first visit should start the lessons`);
  if (!(await page.textContent("#tip"))?.startsWith("Reach the ring.")) fail(`${name}: lesson 1 tip should state the goal`);
  await play(page, "RRRRR");
  if (!(await dialogOpens(page))) fail(`${name}: lesson 1 not solved by RRRRR`);
  await page.click("#next");
  await play(page, "RRLDDD");
  if (!(await dialogOpens(page))) fail(`${name}: lesson 2 not solved by RRLDDD`);
  await page.screenshot({ path: join(out, `${name}-lesson2.png`) });
  await page.keyboard.press("Escape");

  // Winning and navigating away immediately must not leave a stale dialog.
  await page.click('[data-nav="learn"]');
  await play(page, "RRRRR");
  await page.click('[data-nav="today"]');
  await page.waitForTimeout(500);
  if (await page.isVisible("dialog[open]")) fail(`${name}: stale win dialog after navigating`);

  // Today's puzzle at par.
  const sub = await page.textContent("#level-sub");
  const half = Math.floor(level.solution.length / 2);
  await play(page, level.solution.slice(0, half));
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(out, `${name}-daily-mid.png`), fullPage: true });
  await play(page, level.solution.slice(half, -1));
  const playing = await pageBox(page);
  await play(page, level.solution.slice(-1));
  const won = await dialogOpens(page);
  if (!won) fail(`${name}: today's puzzle (${today}) not solved by its solution`);
  else {
    const body = await page.textContent("#win-body");
    if (!body.includes(`${level.par} moves`)) fail(`${name}: expected a ${level.par}-move win, got "${body}"`);
  }
  await page.screenshot({ path: join(out, `${name}-daily-won.png`) });
  if (won) {
    await winKeys(page, name, playing);
    await reopen(page, name);
  }
  console.log(`${name}: ${sub}`);
  await page.close();
}

// With the win dialog open, game keys must leave the board alone, and the
// copied result must use the winning move count. After Escape, Z and R work.
async function winKeys(page, name, playing) {
  const moves = async () => Number((await page.textContent("#moves")).match(/Moves\s*(\d+)/)?.[1]);
  const won = await moves();
  for (const k of ["KeyR", "KeyZ", "Backspace", "Period", "ArrowLeft", "KeyD"]) await page.keyboard.press(k);
  await page.waitForTimeout(200);
  if ((await moves()) !== won) fail(`${name}: keys behind the win dialog changed moves from ${won} to ${await moves()}`);
  if (!(await page.isVisible("dialog[open]"))) fail(`${name}: win dialog closed after game keys`);
  await expectNoSolved(page, name, "while the win dialog is open");
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t) => { window.__copied = t; } } });
  });
  await page.click("#share");
  const copied = await page.evaluate(() => window.__copied ?? "");
  if (!copied.includes(`: ${level.par} moves (par ${level.par}) ★`))
    fail(`${name}: copied result should show the ${level.par}-move win, got "${copied.split("\n")[0]}"`);
  await page.keyboard.press("Escape");
  if (await page.isVisible("dialog[open]")) fail(`${name}: Escape should close the win dialog`);

  // The solved line stays: same result, the dialog's buttons, a nudge on keys.
  await expectSolved(page, name, "after Escape", `Solved in ${level.par} moves, par ${level.par}`, "Past puzzles");
  expectSameBox(name, "after Escape", playing, await pageBox(page));
  await expectCue(page, name, "after Escape", "ArrowLeft");
  await expectCue(page, name, "after Escape", "KeyH");
  await page.screenshot({ path: join(out, `${name}-daily-solved.png`) });
  // Keyboard: Tab from the board reaches Copy result on the solved line, and Enter copies.
  await stubClipboard(page);
  await page.focus("#board");
  for (let i = 0; i < 8 && (await page.evaluate(() => document.activeElement.id)) !== "solved-share"; i++) await page.keyboard.press("Tab");
  if ((await page.evaluate(() => document.activeElement.id)) !== "solved-share") fail(`${name}: Tab from the board should reach the solved line's Copy result`);
  else {
    await page.keyboard.press("Enter");
    const again = await page.evaluate(() => window.__copied);
    if (again !== copied) fail(`${name}: the solved line should copy what the dialog copied, got "${again.split("\n")[0]}"`);
    if ((await page.textContent("#solved-share")) !== "Copied") fail(`${name}: the solved line's Copy result should say "Copied"`);
  }
  await page.focus("#board");
  await page.keyboard.press("KeyZ");
  if ((await moves()) !== won - 1) fail(`${name}: Z after closing the dialog should undo (moves ${await moves()}, wanted ${won - 1})`);
  await expectNoSolved(page, name, "after Undo");
  await page.keyboard.press("KeyR");
  if ((await moves()) !== 0) fail(`${name}: R after closing the dialog should restart (moves ${await moves()})`);
}

// Today's puzzle, solved earlier in this browser: reopening it from Past puzzles
// shows the solved line from the saved best. Keys nudge it (also with reduced
// motion); Start over removes it and play resumes.
async function reopen(page, name) {
  const moves = async () => Number((await page.textContent("#moves")).match(/Moves\s*(\d+)/)?.[1]);
  await openPast(page, level.id);
  await expectSolved(page, name, "reopened from Past puzzles", `Solved in ${level.par} moves, par ${level.par}`, "Past puzzles");
  if ((await moves()) !== 0) fail(`${name}: a reopened puzzle should start at move 0`);
  await expectCue(page, name, "reopened", "ArrowRight");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expectCue(page, name, "reopened, reduced motion", "Space");
  await page.emulateMedia({ reducedMotion: null });
  await stubClipboard(page);
  await page.click("#solved-share");
  const copied = await page.evaluate(() => window.__copied);
  if (!copied.includes(`: ${level.par} moves (par ${level.par}) ★`)) fail(`${name}: copying a reopened puzzle should use the saved best, got "${copied.split("\n")[0]}"`);
  await page.screenshot({ path: join(out, `${name}-reopened.png`) });
  await page.click("#restart");
  await expectNoSolved(page, name, "reopened, after Start over");
  await page.keyboard.press(KEY[level.solution[0]]);
  if ((await moves()) !== 1) fail(`${name}: after Start over a reopened puzzle should play again (moves ${await moves()})`);
}

// Keyboard-first start (desktop): the board has focus on load with a visible
// ring, and Tab from the top of the page goes nav buttons -> board -> Undo.
async function keyboardStart(browser, name, viewport) {
  const page = await browser.newPage({ viewport });
  page.on("pageerror", (e) => fail(`${name}: page error: ${e.message}`));
  await page.goto(base, { waitUntil: "networkidle" }).catch((e) => fail(`${name}: could not load ${base}: ${e.message}`));
  if (!(await page.waitForSelector(".cell", { timeout: 8000 }).catch(() => null))) {
    fail(`${name}: board never rendered`);
    return page.close();
  }
  const ring = await page.evaluate(() => {
    const el = document.activeElement, cs = getComputedStyle(el);
    return { id: el.id, visible: el.matches(":focus-visible"), style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) };
  });
  if (ring.id !== "board") fail(`${name}: board should have focus on load, "${ring.id || "something else"}" does`);
  else if (!ring.visible || ring.style === "none" || !(ring.width > 0)) fail(`${name}: focused board has no visible focus ring`);
  await page.screenshot({ path: join(out, `${name}-board-focus.png`) });

  // Tab order from the top: click blank space at the top-left, then Tab.
  await page.mouse.click(2, 2);
  const seen = [];
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    seen.push(await page.evaluate(() => {
      const el = document.activeElement;
      return el.id || el.dataset.nav || (el.classList.contains("brand") ? "brand" : el.tagName.toLowerCase());
    }));
  }
  const want = "brand,today,learn,archive,board,undo";
  if (seen.join() !== want) fail(`${name}: Tab order from the top was ${seen.join(" > ")}, wanted ${want.split(",").join(" > ")}`);

  // Space on the board waits; Space on a focused button does that button's job.
  const moves = async () => Number((await page.textContent("#moves")).match(/Moves\s*(\d+)/)?.[1]);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".cell", { timeout: 8000 });
  await page.focus("#board");
  const m0 = await moves();
  await page.keyboard.press("Space");
  if ((await moves()) !== m0 + 1) fail(`${name}: Space on the board should wait one step`);
  await page.keyboard.press("Period");
  if ((await moves()) !== m0 + 2) fail(`${name}: Period on the board should wait one step`);
  await page.keyboard.press("ArrowRight");
  if ((await moves()) !== m0 + 3) fail(`${name}: Arrow key on the board should move one step`);
  await page.keyboard.press("Tab");
  const onUndo = await page.evaluate(() => document.activeElement.id);
  if (onUndo !== "undo") fail(`${name}: Tab from the board should reach Undo, reached "${onUndo}"`);
  await page.keyboard.press("Space");
  if ((await moves()) !== m0 + 2) fail(`${name}: Space on focused Undo should undo one step (moves ${await moves()}, wanted ${m0 + 2})`);
  await page.keyboard.press("Enter");
  if ((await moves()) !== m0 + 1) fail(`${name}: Enter on focused Undo should undo one step (moves ${await moves()}, wanted ${m0 + 1})`);
  if ((await page.evaluate(() => document.activeElement.id)) !== "undo") fail(`${name}: keyboard Undo should keep focus on Undo`);

  // A mouse click on a game control hands focus back to the board, so the
  // next Space waits and arrows move without another click.
  for (const id of ["undo", "wait", "restart"]) {
    await page.click(`#${id}`);
    const focused = await page.evaluate(() => document.activeElement.id);
    if (focused !== "board") fail(`${name}: clicking ${id} should hand focus back to the board, "${focused}" has it`);
    const before = await moves();
    await page.keyboard.press("Space");
    if ((await moves()) !== before + 1) fail(`${name}: Space after clicking ${id} should wait one step (moves ${await moves()}, wanted ${before + 1})`);
    await page.keyboard.press("ArrowRight");
    if ((await moves()) !== before + 2) fail(`${name}: Arrow key after clicking ${id} should move one step`);
  }
  await page.close();
}

// Keys hint (mouse or keyboard): from 320 to 480px no line starts or ends with
// "·" and each phrase ("Z undoes") stays on one line; at 390px it takes no
// more than its two lines (so the page is no taller), at 1280px one line, and
// on a touch phone it's hidden.
async function keysHint(browser, name) {
  const lines = (page) => page.evaluate(() => {
    const k = document.querySelector(".keys"), rows = new Map();
    const walk = document.createTreeWalker(k, NodeFilter.SHOW_TEXT);
    for (let n; (n = walk.nextNode());) for (let i = 0; i < n.length; i++) {
      const r = document.createRange();
      r.setStart(n, i); r.setEnd(n, i + 1);
      const b = r.getBoundingClientRect();
      if (!b.width) continue;
      const top = Math.round(b.top + b.height / 2);
      const row = [...rows.keys()].find((t) => Math.abs(t - top) < 4) ?? top;
      rows.set(row, (rows.get(row) || "") + n.data[i]);
    }
    const text = k.textContent.replace(/\s+/g, " ").trim();
    const shown = [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, t]) => t.replace(/\s+/g, " ").trim());
    const phrases = text.split(" · ").map((p) => {
      const at = shown.findIndex((l) => l.includes(p));
      return { p, whole: at >= 0 };
    });
    return { shown, phrases, visible: !!k.offsetParent };
  });
  for (const width of [320, 390, 480, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    page.on("pageerror", (e) => fail(`${name}: page error: ${e.message}`));
    await page.goto(base, { waitUntil: "networkidle" }).catch((e) => fail(`${name}: could not load ${base}: ${e.message}`));
    await page.waitForSelector(".cell", { timeout: 8000 }).catch(() => fail(`${name}: board never rendered at ${width}px`));
    const got = await lines(page);
    const label = `${name} at ${width}px`;
    if (!got.visible) fail(`${label}: the keys hint should show without touch`);
    for (const l of got.shown) if (l.startsWith("·") || l.endsWith("·")) fail(`${label}: a keys hint line starts or ends with "·": "${l}"`);
    for (const { p, whole } of got.phrases) if (!whole) fail(`${label}: "${p}" should stay on one line (lines: ${JSON.stringify(got.shown)})`);
    if (width === 390 && got.shown.length > 2) fail(`${label}: the keys hint should take at most two lines, got ${JSON.stringify(got.shown)}`);
    if (width === 1280 && got.shown.length !== 1)fail(`${label}: the keys hint should be one line, got ${JSON.stringify(got.shown)}`);
    console.log(`${label}: keys hint ${JSON.stringify(got.shown)}`);
    await page.locator(".keys").screenshot({ path: join(out, `${name}-keys-${width}.png`) });
    await page.close();
  }
  const touch = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await touch.goto(base, { waitUntil: "networkidle" }).catch((e) => fail(`${name}: could not load ${base}: ${e.message}`));
  await touch.waitForSelector(".cell", { timeout: 8000 }).catch(() => {});
  if ((await lines(touch)).visible) fail(`${name}: the keys hint should be hidden on a touch phone`);
  await touch.close();
}

// Touch (phone): tapping controls works, keeps the page still, and leaves no
// focus ring on the board.
async function touchControls(browser, name, viewport) {
  const page = await browser.newPage({ viewport, hasTouch: true, isMobile: true });
  page.on("pageerror", (e) => fail(`${name}: page error: ${e.message}`));
  await page.goto(base, { waitUntil: "networkidle" }).catch((e) => fail(`${name}: could not load ${base}: ${e.message}`));
  if (!(await page.waitForSelector(".cell", { timeout: 8000 }).catch(() => null))) {
    fail(`${name}: board never rendered`);
    return page.close();
  }
  const moves = async () => Number((await page.textContent("#moves")).match(/Moves\s*(\d+)/)?.[1]);

  // The Hint button shares the controls row: one line, and the d-pad sits
  // exactly where it would without it (and stays put while a hint shows).
  const layout = () => page.evaluate(() => {
    const c = document.querySelector(".controls");
    return {
      dpad: document.querySelector(".dpad").getBoundingClientRect().top + window.scrollY,
      rows: new Set([...c.querySelectorAll("button")].map((b) => Math.round(b.getBoundingClientRect().top))).size,
      overflow: c.scrollWidth > c.clientWidth,
    };
  });
  const withHint = await layout();
  await page.evaluate(() => (document.querySelector("#hint").style.display = "none"));
  const withoutHint = await layout();
  await page.evaluate(() => (document.querySelector("#hint").style.display = ""));
  if (withHint.rows !== 1 || withHint.overflow) fail(`${name}: game controls should fit on one row (${withHint.rows} rows, overflow ${withHint.overflow})`);
  if (withHint.dpad !== withoutHint.dpad) fail(`${name}: Hint button moved the d-pad from ${withoutHint.dpad} to ${withHint.dpad}`);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const steps = [["#wait", 1], ["#hint", 1, "nudge"], ["#hint", 1, "move"], ['[data-move="3"]', 2], ["#undo", 1], ["#restart", 0]];
  for (const [sel, want, kind] of steps) {
    const y0 = await page.evaluate(() => window.scrollY);
    await page.tap(sel);
    await page.waitForTimeout(100);
    const got = await moves(), y1 = await page.evaluate(() => window.scrollY);
    if (got !== want) fail(`${name}: tapping ${sel} left moves at ${got}, wanted ${want}`);
    if (y1 !== y0) fail(`${name}: tapping ${sel} scrolled the page (${y0} -> ${y1})`);
    const { id, ring } = await page.evaluate(() => ({ id: document.activeElement.id, ring: document.querySelector("#board").matches(":focus-visible") }));
    if (id !== "board") fail(`${name}: tapping ${sel} should hand focus back to the board, "${id}" has it`);
    if (ring) fail(`${name}: tapping ${sel} left a focus ring on the board`);
    if (kind === "nudge") {
      const text = await page.textContent("#hint-note");
      if (text !== "Stand on plate A to open its door.") fail(`${name}: first Hint tap in lesson 1 should nudge, got "${text}"`);
      if (await page.isVisible("#board .hint-mark")) fail(`${name}: a nudge should not mark a move`);
      if ((await layout()).dpad !== withHint.dpad) fail(`${name}: showing a nudge moved the d-pad`);
      await page.screenshot({ path: join(out, `${name}-nudge.png`) });
    } else if (kind === "move") {
      if (!(await page.isVisible("#board .hint-mark"))) fail(`${name}: tapping Hint again should mark the next move on the board`);
      if (!(await page.textContent("#hint-note"))?.startsWith("Hint: ")) fail(`${name}: tapping Hint again should say the next move`);
      if ((await layout()).dpad !== withHint.dpad) fail(`${name}: showing a hint moved the d-pad`);
      await page.screenshot({ path: join(out, `${name}-hint.png`) });
    }
  }
  await page.screenshot({ path: join(out, `${name}-after-taps.png`) });

  // Today's puzzle: its nudge fits on one line and leaves the d-pad where it was.
  await page.tap('[data-nav="today"]');
  await page.waitForFunction(() => document.querySelector("#level-title").textContent.startsWith("Puzzle "));
  const before = await layout();
  await page.tap("#hint");
  await page.waitForSelector("#hint-note:not([hidden])");
  const fit = await page.evaluate(() => {
    const n = document.querySelector("#hint-note"), s = document.querySelector(".status");
    const r = n.getBoundingClientRect(), t = document.createRange();
    t.selectNodeContents(n);
    const text = t.getBoundingClientRect();
    return { text: n.textContent, inside: text.left >= r.left - 0.5 && text.right <= r.right + 0.5, page: document.documentElement.scrollWidth <= window.innerWidth, statusW: s.clientWidth, textW: Math.round(text.width) };
  });
  if (fit.text.startsWith("Hint: ") || !fit.text.endsWith(".")) fail(`${name}: today's first hint should be a nudge sentence, got "${fit.text}"`);
  if (!fit.inside || !fit.page) fail(`${name}: today's nudge "${fit.text}" is ${fit.textW}px wide, the status line ${fit.statusW}px`);
  if ((await layout()).dpad !== before.dpad) fail(`${name}: today's nudge moved the d-pad`);
  await page.screenshot({ path: join(out, `${name}-daily-nudge.png`) });
  console.log(`${name}: today's nudge "${fit.text}" (${fit.textW}px of ${fit.statusW}px)`);

  // Start over, solve it, close the dialog without its buttons: the solved line takes the
  // d-pad's place (which can't move anything now) and pushes nothing down.
  const box = () => page.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e.offsetParent) return null; const b = e.getBoundingClientRect(); return { top: b.top + window.scrollY, bottom: b.bottom + window.scrollY }; };
    const dpad = document.querySelector(".dpad");
    return {
      solved: r("#solved-actions"), controls: r(".controls"), dpad: getComputedStyle(dpad).visibility === "visible" ? r(".dpad") : null, dpadPlace: r(".dpad"),
      status: r(".status-row"), text: r("#solved-text"), wide: document.documentElement.scrollWidth > window.innerWidth,
      height: document.documentElement.scrollHeight, footer: Math.round(document.querySelector(".foot").getBoundingClientRect().top + window.scrollY),
    };
  });
  await page.tap("#restart");
  // During play means just before the winning move: the status line can wrap
  // once the echo appears, which moves the controls by itself.
  await play(page, level.solution.slice(0, -1));
  const playing = await box();
  await play(page, level.solution.slice(-1));
  if (!(await dialogOpens(page))) {
    fail(`${name}: today's puzzle not solved by its solution`);
    return page.close();
  }
  await expectNoSolved(page, name, "while the win dialog is open");
  await page.evaluate(() => document.querySelector("#win").close());
  await expectSolved(page, name, "after the dialog closed", `Solved in ${level.par} moves, par ${level.par}`, "Past puzzles");
  const done = await box();
  if (!done.solved) fail(`${name}: no solved line on the phone`);
  else {
    if (done.dpad) fail(`${name}: the d-pad should give its place to the solved line`);
    if (done.solved.top < done.controls.bottom || done.solved.bottom > playing.dpad.bottom + 0.5)
      fail(`${name}: the solved line (${Math.round(done.solved.top)}-${Math.round(done.solved.bottom)}px) should sit within the d-pad's place (${Math.round(playing.dpad.top)}-${Math.round(playing.dpad.bottom)}px)`);
    if (done.controls.top !== playing.controls.top) fail(`${name}: the solved line moved the controls (${JSON.stringify(playing)} -> ${JSON.stringify(done)})`);
    if (done.text.top < done.status.top - 0.5 || done.text.bottom > done.status.bottom + 0.5) fail(`${name}: the solved result should sit in the status line's place`);
    if (done.wide) fail(`${name}: the solved line scrolls sideways`);
    expectSameBox(name, "after the dialog closed", playing, done);
    console.log(`${name}: solved line ${Math.round(done.solved.top)}-${Math.round(done.solved.bottom)}px, d-pad during play ${Math.round(playing.dpad.top)}-${Math.round(playing.dpad.bottom)}px of 844`);
  }
  await page.screenshot({ path: join(out, `${name}-daily-solved.png`) });
  await stubClipboard(page);
  await page.tap("#solved-share");
  if (!(await page.evaluate(() => window.__copied)).includes(`: ${level.par} moves (par ${level.par}) ★`)) fail(`${name}: tapping Copy result on the solved line should copy the result`);
  await page.tap("#undo");
  await expectNoSolved(page, name, "after tapping Undo");
  const undone = await box();
  if (undone.dpad?.top !== playing.dpad.top) fail(`${name}: after Undo the d-pad should be back where it was (${JSON.stringify(playing.dpad)} -> ${JSON.stringify(undone.dpad)})`);
  await page.close();
}

// Hints: follow them through lessons 1-3 (each solved in its shortest number of
// moves), get stuck in lesson 4 and take the offered undo, then use one hint on
// today's puzzle (counted in the result) and one on a past puzzle (not counted).
async function hintFlow(browser, name, viewport) {
  const page = await browser.newPage({ viewport });
  page.on("console", (m) => m.type() === "error" && fail(`${name}: console error: ${m.text()}`));
  page.on("pageerror", (e) => fail(`${name}: page error: ${e.message}`));
  await page.goto(base, { waitUntil: "networkidle" }).catch((e) => fail(`${name}: could not load ${base}: ${e.message}`));
  if (!(await page.waitForSelector(".cell", { timeout: 8000 }).catch(() => null))) {
    fail(`${name}: board never rendered`);
    return page.close();
  }
  const moves = async () => Number((await page.textContent("#moves")).match(/Moves\s*(\d+)/)?.[1]);
  const noteText = () => page.textContent("#hint-note");
  // The first H on a puzzle: a nudge sentence, no move marked, no move made.
  const expectNudge = async (label, want) => {
    const m0 = await moves();
    await page.keyboard.press("KeyH");
    const text = await noteText();
    if (!(await page.isVisible("#hint-note")) || (want ? text !== want : text.startsWith("Hint: ") || !text.endsWith(".")))
      fail(`${name}: ${label}: first hint should nudge${want ? ` "${want}"` : ""}, got "${text}"`);
    if (await page.isVisible("#board .hint-mark")) fail(`${name}: ${label}: a nudge should not mark a move`);
    if (await page.locator(".hinted").count()) fail(`${name}: ${label}: a nudge should not light up a button`);
    if ((await moves()) !== m0) fail(`${name}: ${label}: a nudge should not make a move`);
    const live = await page.evaluate(() => document.querySelector("#hint-note").closest("[aria-live]")?.getAttribute("aria-live"));
    if (live !== "polite") fail(`${name}: ${label}: the nudge should be announced like other hints (aria-live ${live})`);
  };
  // Press H, then the hinted move, until the level is won.
  const followHints = async (label) => {
    for (let i = 0; i < 80; i++) {
      await page.keyboard.press("KeyH");
      if (!(await page.isVisible("#hint-note"))) return dialogOpens(page); // won: H does nothing
      if (!(await noteText()).startsWith("Hint: ")) {
        fail(`${name}: ${label}: after the nudge every hint should be a move, got "${await noteText()}"`);
        return false;
      }
      const m = await page.getAttribute("#board .hint-mark", "data-hint");
      if (!(await page.isVisible("#board .hint-mark")) || m === null) {
        fail(`${name}: ${label}: hint showed "${await noteText()}" but no move on the board`);
        return false;
      }
      await page.keyboard.press(KEY["UDLR."[m]]);
    }
    return false;
  };

  const echoA = "Let your echo hold plate A for you.";
  for (const [lesson, best, nudge] of [[1, 5, "Stand on plate A to open its door."], [2, 6, echoA], [3, 12, echoA]]) {
    await expectNudge(`lesson ${lesson}`, nudge);
    if (!(await followHints(`lesson ${lesson}`))) {
      fail(`${name}: following hints did not solve lesson ${lesson}`);
      return page.close();
    }
    const body = await page.textContent("#win-body");
    if (body !== `Solved in ${best} moves.`) fail(`${name}: hints should solve lesson ${lesson} in ${best} moves with nothing about hints, got "${body}"`);
    await page.click("#next");
  }

  // Lesson 4: after RDDD..UD.. the echo can no longer hold plate B for you.
  // Saying so comes before the nudge, which waits for a winnable position.
  await play(page, "RDDD..UD..");
  // U takes the offer only while it shows: here it does nothing yet.
  await page.keyboard.press("KeyU");
  if ((await moves()) !== 10) fail(`${name}: U with no undo offer showing should do nothing, moves ${await moves()}`);
  await page.keyboard.press("KeyH");
  const offer = "Can't win from here. Undo 3 moves? Press U";
  if ((await noteText()) !== offer) fail(`${name}: lost position should offer "${offer}", got "${await noteText()}"`);
  if (await page.isVisible("#board .hint-mark")) fail(`${name}: a lost position should not mark a move`);
  await page.screenshot({ path: join(out, `${name}-stuck.png`) });
  // The mouse takes it as before: click the link, back to move 7, board focused.
  await page.click("#hint-note button");
  if ((await moves()) !== 7) fail(`${name}: the offered undo should go back to move 7, at ${await moves()}`);
  if ((await page.evaluate(() => document.activeElement.id)) !== "board") fail(`${name}: after the offered undo the board should have focus`);
  await page.keyboard.press("KeyU");
  if ((await moves()) !== 7) fail(`${name}: U after the offer was taken should do nothing, moves ${await moves()}`);

  // The keyboard takes it too: lose again, Tab to Hint, press it with Enter, then U.
  await play(page, "D..");
  for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
  if ((await page.evaluate(() => document.activeElement.id)) !== "hint") fail(`${name}: four Tabs from the board should reach Hint`);
  await page.keyboard.press("Enter");
  if ((await noteText()) !== offer) fail(`${name}: Hint by keyboard should offer "${offer}", got "${await noteText()}"`);
  // The offer stays on one line on a 390px-wide screen with a keyboard.
  await page.setViewportSize({ width: 390, height: 844 });
  const offerFit = await page.evaluate(() => {
    const n = document.querySelector("#hint-note"), s = document.querySelector(".status");
    const r = n.getBoundingClientRect(), t = document.createRange();
    t.selectNodeContents(n);
    const text = t.getBoundingClientRect();
    return { lines: text.height < 2 * parseFloat(getComputedStyle(n).fontSize) ? 1 : 2, inside: text.left >= r.left - 0.5 && text.right <= r.right + 0.5, page: document.documentElement.scrollWidth <= window.innerWidth, statusW: s.clientWidth, textW: Math.round(text.width) };
  });
  // With room to spare for a two-digit count and wider fonts.
  if (offerFit.lines !== 1 || !offerFit.inside || !offerFit.page || offerFit.textW > offerFit.statusW - 24)
    fail(`${name}: the undo offer at 390px should fit on one line with 24px to spare (${offerFit.lines} lines, ${offerFit.textW}px of ${offerFit.statusW}px)`);
  else console.log(`${name}: the undo offer at 390px: ${offerFit.textW}px of ${offerFit.statusW}px`);
  await page.screenshot({ path: join(out, `${name}-stuck-390.png`) });
  await page.setViewportSize(viewport);
  await page.keyboard.press("KeyU");
  if ((await moves()) !== 7) fail(`${name}: U should take the offered undo back to move 7, at ${await moves()}`);
  if (await page.isVisible("#hint-note")) fail(`${name}: the offer should go once U takes it`);
  if ((await page.evaluate(() => document.activeElement.id)) !== "board") fail(`${name}: after U takes the offer the board should have focus`);
  await page.keyboard.press("KeyU");
  if ((await moves()) !== 7) fail(`${name}: U a second time should do nothing, moves ${await moves()}`);
  // The position after the undo can be won: the nudge, then hints solve it.
  await expectNudge("lesson 4 after the undo", "Let your echo hold plate B for you.");
  await page.screenshot({ path: join(out, `${name}-nudge.png`) });
  if (!(await followHints("lesson 4"))) {
    fail(`${name}: following hints after the undo did not solve lesson 4`);
    return page.close();
  }
  await page.click("#next"); // "Next lesson"

  // Lesson 5: the nudge names the bump, and hints solve it in its shortest 9 moves.
  await expectNudge("lesson 5", "Let your echo hold A, then bump a door.");
  if (!(await followHints("lesson 5"))) {
    fail(`${name}: following hints did not solve lesson 5`);
    return page.close();
  }
  if ((await page.textContent("#moves")).match(/Moves\s*(\d+)/)?.[1] !== "9") fail(`${name}: hints should solve lesson 5 in 9 moves, took ${await moves()}`);
  await page.click("#next"); // "Play today's puzzle"

  // Today's puzzle: a nudge, then one hint (pressed twice at the same spot) for
  // the last move. Only the move counts: "with 1 hint".
  await page.waitForSelector(".cell");
  await play(page, level.solution.slice(0, -1));
  await expectNudge("today's puzzle");
  await page.click("#hint");
  await page.keyboard.press("KeyH");
  const last = level.solution.at(-1);
  if ((await page.getAttribute("#board .hint-mark", "data-hint")) !== String("UDLR.".indexOf(last)))
    fail(`${name}: hint before the last move should point at ${last}`);
  if ((await moves()) !== level.par - 1) fail(`${name}: hints should not count as moves (moves ${await moves()})`);
  await page.screenshot({ path: join(out, `${name}-daily-hint.png`) });
  await page.keyboard.press(KEY[last]);
  if (!(await dialogOpens(page))) {
    fail(`${name}: today's puzzle not won after following the hint`);
    return page.close();
  }
  const body = await page.textContent("#win-body");
  if (!body.includes(`in ${level.par} moves with 1 hint.`)) fail(`${name}: win dialog should say "with 1 hint", got "${body}"`);
  const copy = async () => {
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t) => { window.__copied = t; } } });
    });
    await page.click("#share");
    return page.evaluate(() => window.__copied ?? "");
  };
  const copied = await copy();
  if (!copied.includes(`: ${level.par} moves with 1 hint (par ${level.par}) ★`)) fail(`${name}: copied result should say "with 1 hint", got "${copied.split("\n")[0]}"`);
  await page.screenshot({ path: join(out, `${name}-daily-won-hint.png`) });
  await page.keyboard.press("Escape");
  // The solved line says what the dialog said, hint and all, and copies the same.
  await expectSolved(page, name, "today's puzzle with a hint", `Solved in ${level.par} moves with 1 hint, par ${level.par}`, "Past puzzles");
  await page.evaluate(() => (window.__copied = ""));
  await page.click("#solved-share");
  if ((await page.evaluate(() => window.__copied)) !== copied) fail(`${name}: the solved line should copy "with 1 hint" like the dialog did`);

  // A past puzzle: a hint helps, but the result stays as it was.
  const pastDate = readdirSync(join(repo, "levels/daily")).map((f) => f.replace(".json", "")).filter((d) => d < today).sort()[0];
  if (pastDate) {
    const past = JSON.parse(readFileSync(join(repo, "levels/daily", `${pastDate}.json`), "utf8"));
    await page.click('[data-nav="archive"]');
    await page.evaluate((id) => [...document.querySelectorAll("#archive-list button")].find((b) => b.textContent.startsWith(`Puzzle ${id} `)).click(), past.id);
    await page.waitForFunction((id) => document.querySelector("#level-title").textContent === `Puzzle ${id}`, past.id);
    await play(page, past.solution.slice(0, -1));
    await expectNudge(`past puzzle ${pastDate}`);
    await page.keyboard.press("KeyH");
    await page.keyboard.press(KEY[past.solution.at(-1)]);
    if (!(await dialogOpens(page))) fail(`${name}: past puzzle ${pastDate} not won after a hint`);
    else {
      const pastBody = await page.textContent("#win-body");
      const pastCopy = await copy();
      if (/hint/.test(pastBody) || /hint/.test(pastCopy)) fail(`${name}: a past puzzle's result should not mention hints ("${pastBody}" / "${pastCopy.split("\n")[0]}")`);
      await page.keyboard.press("Escape");
      await expectSolved(page, name, `past puzzle ${pastDate}`, `Solved in ${past.par} moves, par ${past.par}`, "Past puzzles");
      // Reopen it from Past puzzles: the same solved line, from the saved best.
      await page.click("#solved-next");
      if (await page.isHidden("#archive")) fail(`${name}: the solved line's Next on a past puzzle should open Past puzzles`);
      await openPast(page, past.id);
      await expectSolved(page, name, `reopened past puzzle ${pastDate}`, `Solved in ${past.par} moves, par ${past.par}`, "Past puzzles");
      const reCopy = await page.evaluate(() => {
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t) => { window.__copied = t; } } });
        document.querySelector("#solved-share").click();
        return new Promise((r) => setTimeout(() => r(window.__copied), 50));
      });
      if (!reCopy.includes(`#${past.id}: ${past.par} moves (par ${past.par}) ★`)) fail(`${name}: copying reopened past puzzle ${pastDate} should give its saved best, got "${reCopy.split("\n")[0]}"`);
      await page.screenshot({ path: join(out, `${name}-past-reopened.png`) });
    }
    // An unsolved past puzzle shows no solved line.
    const other = readdirSync(join(repo, "levels/daily")).map((f) => f.replace(".json", "")).filter((d) => d < today && d !== pastDate).sort()[0];
    if (other) {
      const o = JSON.parse(readFileSync(join(repo, "levels/daily", `${other}.json`), "utf8"));
      await openPast(page, o.id);
      await expectNoSolved(page, name, `unsolved past puzzle ${other}`);
    }
  }
  await page.close();
}

// All five lessons in a row, by keyboard or by tapping the d-pad. Each says
// "Lesson n of 5"; lessons 1-4 lead to the next, lesson 5 to today's puzzle.
// Lesson 5 can only be won by letting the echo bump door a while it stands on
// plate B: check it does, that the board and d-pad fit like lesson 4's, and
// that its tip reads as one balanced block.
const LESSONS = ["RRRRR", "RRLDDD", "RRRRLLLDUDDD", "RRLDDDDD", "RRLDDDDDR"];
async function lessons(browser, name, viewport, colorScheme, touch) {
  const page = await browser.newPage({ viewport, colorScheme, hasTouch: touch, isMobile: touch });
  page.on("console", (m) => m.type() === "error" && fail(`${name}: console error: ${m.text()}`));
  page.on("pageerror", (e) => fail(`${name}: page error: ${e.message}`));
  await page.goto(base, { waitUntil: "networkidle" }).catch((e) => fail(`${name}: could not load ${base}: ${e.message}`));
  if (!(await page.waitForSelector(".cell", { timeout: 8000 }).catch(() => null))) {
    fail(`${name}: board never rendered`);
    return page.close();
  }
  const move = async (m) => {
    if (!touch) return page.keyboard.press(KEY[m]);
    await page.tap(m === "." ? "#wait" : `.dpad [data-move="${"UDLR".indexOf(m)}"]`);
  };
  const layout = () => page.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    return {
      board: r("#board"), dpad: r(".dpad"), wide: document.documentElement.scrollWidth > window.innerWidth,
      cell: r(".cell").width,
    };
  });
  let four, lowest = 0;
  for (const [i, sol] of LESSONS.entries()) {
    const n = i + 1;
    const sub = await page.textContent("#level-sub");
    if (sub !== `Lesson ${n} of 5`) fail(`${name}: lesson ${n} should say "Lesson ${n} of 5", says "${sub}"`);
    const at = await layout();
    if (at.wide) fail(`${name}: lesson ${n} scrolls sideways`);
    if (n === 4) four = at;
    if (n < 5) lowest = Math.max(lowest, at.dpad.bottom);
    if (n === 5) {
      if ((await page.textContent("#level-title")) !== "Out of step") fail(`${name}: lesson 5 should be "Out of step"`);
      if ((await page.textContent("#tip")) !== "A closed door stops your echo. Keep it on B.") fail(`${name}: lesson 5 tip should explain the bump`);
      if (at.board.right > viewport.width || at.board.left < 0 || at.dpad.right > viewport.width) fail(`${name}: lesson 5 board or d-pad is off screen`);
      if (at.board.height !== four.board.height || at.cell !== four.cell) fail(`${name}: lesson 5 board (${at.board.height}px, cells ${at.cell}px) should match lesson 4's (${four.board.height}px, ${four.cell}px)`);
      if (at.dpad.bottom > lowest + 0.5) fail(`${name}: lesson 5's d-pad ends at ${at.dpad.bottom}px, lower than any other lesson's (${lowest}px)`);
      console.log(`${name}: lesson 5 board ${at.board.width}x${at.board.height}, d-pad ends at ${Math.round(at.dpad.bottom)}px of ${viewport.height} (lessons 1-4: ${Math.round(lowest)}px)`);
      await page.screenshot({ path: join(out, `${name}-lesson5.png`) });
    }
    for (const [j, m] of [...sol].entries()) {
      await move(m);
      // Lesson 5: on move 7 the echo bumps door a and stays on plate B.
      if (n === 5 && j === 6) {
        const st = await page.evaluate(() => ({
          bumped: document.querySelector(".piece.echo").classList.contains("bump"),
          onB: (() => { const e = document.querySelector(".piece.echo"); return e.style.getPropertyValue("--x") + "," + e.style.getPropertyValue("--y"); })(),
        }));
        if (!st.bumped || st.onB !== "1,1") fail(`${name}: lesson 5 move 7 should bump the echo into door a, leaving it on plate B (bumped ${st.bumped}, echo at ${st.onB})`);
        await page.screenshot({ path: join(out, `${name}-lesson5-bump.png`) });
      }
    }
    if (!(await dialogOpens(page))) {
      fail(`${name}: lesson ${n} not solved by ${sol}`);
      return page.close();
    }
    const next = await page.textContent("#next");
    const want = n < 5 ? "Next lesson" : "Play today's puzzle";
    if (next !== want) fail(`${name}: lesson ${n} win dialog should offer "${want}", offers "${next}"`);
    await expectNoSolved(page, name, `lesson ${n}, while the win dialog is open`);
    if (n === 5) await page.screenshot({ path: join(out, `${name}-lesson5-won.png`) });
    if (n === 1) {
      // Close the dialog, then take the solved line's Next. On a phone, a fast
      // double-tap on it must not move in lesson 2: the d-pad comes back near
      // where Next was.
      if (touch) await page.evaluate(() => document.querySelector("#win").close());
      else await page.keyboard.press("Escape");
      await expectSolved(page, name, `lesson ${n}, after the dialog closed`, `Solved in ${sol.length} moves`, want, false);
      if (!touch) await page.click("#solved-next");
      else {
        await page.locator("#solved-next").scrollIntoViewIfNeeded();
        const b = await page.locator("#solved-next").boundingBox();
        const x = b.x + b.width / 2, y = b.y + b.height / 2;
        // Worst case: the second tap of the double-tap lands on a d-pad button
        // wherever the d-pad reappears (Right would make lesson 2's first move).
        await page.touchscreen.tap(x, y);
        const r = await page.locator('.dpad [data-move="3"]').boundingBox();
        await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2);
        await page.waitForTimeout(100);
        const after = await page.evaluate(() => ({
          sub: document.querySelector("#level-sub").textContent,
          moves: Number(document.querySelector("#moves").textContent.match(/Moves\s*(\d+)/)?.[1]),
          bumped: document.querySelector(".piece.player").classList.contains("bump"),
        }));
        if (after.sub !== "Lesson 2 of 5") fail(`${name}: double-tapping Next should open lesson 2, got "${after.sub}"`);
        if (after.moves !== 0 || after.bumped) fail(`${name}: a d-pad tap right after Next made a stray move in lesson 2 (moves ${after.moves}, bumped ${after.bumped})`);
        else console.log(`${name}: a d-pad tap right after tapping Next: no move`);
        await page.waitForTimeout(500); // the d-pad listens again after a moment
      }
    } else if (touch) await page.tap("#next");
    else await page.keyboard.press("Enter"); // the dialog's focused button is Copy result (hidden) or Next
  }
  await page.waitForFunction(() => document.querySelector("#level-title").textContent.startsWith("Puzzle "), null, { timeout: 4000 })
    .catch(() => fail(`${name}: "Play today's puzzle" after lesson 5 did not open today's puzzle`));
  await page.close();
}

const browser = await chromium.launch({ executablePath: browserPath });
try {
  await keyboardStart(browser, "desktop-dark", { width: 1280, height: 900 });
  await keysHint(browser, "keys-hint");
  await session(browser, "desktop-dark", { width: 1280, height: 900 }, "dark");
  await session(browser, "phone-light", { width: 390, height: 844 }, "light");
  await touchControls(browser, "phone-touch", { width: 390, height: 844 });
  await hintFlow(browser, "desktop-hints", { width: 1280, height: 900 });
  await lessons(browser, "desktop-lessons-dark", { width: 1280, height: 900 }, "dark", false);
  await lessons(browser, "phone-lessons-light", { width: 390, height: 844 }, "light", true);
} finally {
  await browser.close();
}

if (failures.length) {
  console.error("PLAYTEST FAIL\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log(`PLAYTEST PASS (screenshots in ${out})`);
