// Afterstep playtest: plays lessons 1-2 and today's puzzle (with the solver's
// solution) in a real browser, at desktop-dark and phone-light sizes, and
// checks the keyboard-first start (board focus, ring, Tab order, click-then-key)
// on desktop and tapping the controls on a touch phone. Hint check: the first
// hint on each puzzle is a nudge about its idea (no move marked, not counted);
// follows hints through lessons 1-3, gets stuck in lesson 4 and takes the
// offered undo by mouse and then, after Hint by keyboard, with U (which does
// nothing while no offer shows; the offer fits one line at 390px), follows
// hints through lesson 5 (the echo bump). On today's puzzle and a past one each
// hint counts as a move (lab#25): no "Perfect" or star at par, "with N hints"
// in the dialog, copied result, solved line and Past puzzles, and today's count
// is kept after How to play and back, a reload and Start over. Each of those
// gives the nudge again on the next first press, free (lab#29). A save from
// before hints counted still shows as it did, and a worse hinted solve doesn't
// replace it. On the touch
// phone, today's nudge fits on one line. Lessons: all five are played in a row
// by keyboard (desktop, dark) and by tapping the d-pad (phone, light), checking
// "Lesson n of 5", where each win dialog leads, that lesson 5 fits, and that
// lessons 4 and 5's tips name plates in full ("plate B", lab#29).
// Screen readers (lab#42): the move counter and echo status are outside every
// live region; in lesson 5 the live regions say nothing after a plain step,
// the echo, plate and door news after the second, and "The echo bumps into
// door A." when the echo bumps.
// Solved state: hidden while the win dialog is open; after it closes (Escape), a
// solved line with Copy result and Next stays (the result in the status line's
// place, the buttons in the keys hint's or d-pad's), keys nudge it, Tab reaches
// it, and Undo / Start over remove it; reopening a solved puzzle from Past
// puzzles shows it again from the saved best (an unsolved one doesn't). The page
// is no taller and the footer no lower than during play at 1280x900, 390x844
// and 390x844 touch, and a fast double-tap on Next can't move in the next lesson.
// Keys hint: from 320 to 480px without touch no line starts or ends with "·"
// and no phrase breaks; one line at 1280px; hidden on a touch phone, and after
// the first touch on a screen that reports a fine pointer (the d-pad shows).
// Fit (lab#10): on touch phones at 360x640, 390x700 and 390x844 the lessons
// are played by tapping the d-pad, and the board, status line, controls and
// d-pad must be on screen without scrolling in every lesson and today's
// puzzle; so too at 320x568 and in landscape (844x390, 667x375, board beside
// the controls), also late in today's puzzle with the board's size unchanged.
// Nudges (lab#29): at each of those sizes today's nudge, shown by tapping Hint,
// and every lesson's and daily's nudge (from the engine build the page uses)
// fit the status line on one line with room to spare.
// Touch targets (nav, controls, d-pad) are at least 44px tall.
// Likes (lab#17): every page uses a mocked lab like API and may ask nothing but
// Afterstep and that API. Liking shows at once, survives a reload and unlikes
// with the stored receipt (also days later); the win dialog's heart, 409 and
// 429 notes, keyboard, labels and no cookies; the page is no taller with the
// heart at 390x844; with the API resting (503), unreachable or slow the game
// plays at once and the heart never shows. Two tabs (lab#37): in one browser
// context, a like or unlike in one tab shows in the other with the count +-1
// and no request; a like on its way in one tab while the other's lands isn't
// disturbed and ends on the other's like, counted once, with no note.
// Font (lab#36): Young Serif loads, from Afterstep's own origin.
// Routes (lab#8): today (bare URL), Past puzzles (#/past), a past puzzle
// (#/puzzle/<date>) and lessons (#/learn/<n>) each push one history entry
// (moves push none) and set the title; Back and Forward walk them without
// leaving the site, also with the win dialog open; reloading keeps the screen;
// a past puzzle's copied result links to it, today's to the home page; links
// to a future, missing or malformed date or an unknown route open today's
// puzzle with the URL replaced and no console error.
// Past puzzles links (lab#41): each entry is an <a href="#/puzzle/<date>">
// styled as before (border, no underline, hover, focus ring, full width); a
// middle click and a Cmd/Ctrl click open it in a new tab and leave the list
// alone; #/puzzle/<today> (from the list, opened directly or typed in place)
// is today's puzzle at the bare URL with the home title and Today marked (a
// newcomer opening it gets lesson 1, as at the bare URL); Back
// to Past puzzles focuses the entry you came from, or the heading.
// Level loading (lab#40): a daily's request blocked, refused (404) or not a
// level, and the index blocked, show a short message with Retry (announced,
// focused, Back works) and no page or console error but the browser's own line
// for each blocked request; Retry loads it once the network is back. Keys, the
// d-pad and Hint during a slow load leave the old board alone (solved or not)
// and nudge nothing; a slow load says so, a quick one shows no message.
//
// Usage: node tests/playtest.ts <baseUrl>
// Env:   PLAYTEST_BROWSER  Chromium-based browser executable (default: Brave)
//        PLAYTEST_OUT      screenshot folder (default: ./playtest-out)
// Exit:  0 = pass, 1 = fail (reasons printed)
import { chromium } from "playwright";
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join, dirname } from "node:path";

const base = process.argv[2];
if (!base) {
  console.error("usage: node tests/playtest.ts <baseUrl>");
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

// Every lesson's and daily's nudge, from the engine build the page is served from.
const nudges = await (async () => {
  const { initSync, WasmGame } = await import(pathToFileURL(join(repo, "web/src/wasm/afterstep_engine.js")).href);
  initSync({ module: readFileSync(join(repo, "web/src/wasm/afterstep_engine_bg.wasm")) });
  const out = {};
  for (const dir of ["tutorial", "daily"]) {
    for (const f of readdirSync(join(repo, "levels", dir)).filter((f) => f.endsWith(".json")).sort()) {
      const l = JSON.parse(readFileSync(join(repo, "levels", dir, f), "utf8"));
      const g = new WasmGame(l.grid.join("\n"), l.delay);
      out[`${dir}/${f.replace(".json", "")}`] = g.nudge();
      g.free();
    }
  }
  return out;
})();

declare global { interface Window { [hook: `__${string}`]: any } } // the playtest's own hooks: window.__copied, __seen, …

const failures = [];
const fail = (msg) => failures.push(msg);
const dialogOpens = (page) => page.waitForSelector("dialog[open]", { timeout: 2500 }).then(() => true, () => false);

// The solved line below the board: its text and Next label, or null when hidden.
const solvedLine = (page) => page.evaluate(() => {
  const t = document.querySelector<HTMLElement>("#solved-text"), a = document.querySelector<HTMLElement>("#solved-actions");
  if (!t || !a) return null;
  if (a.hidden || !a.offsetParent) return t.textContent ? { text: t.textContent, actions: false } : null;
  return { text: t.textContent, actions: true, share: !document.querySelector<HTMLElement>("#solved-share").hidden, next: document.querySelector<HTMLElement>("#solved-next").textContent };
});
async function expectSolved(page, name, label, text, next, share = true) {
  // The line shows when the dialog's close event runs, a task after it closes.
  await page.waitForFunction(() => document.querySelector<HTMLElement>("#solved-actions")?.offsetParent, null, { timeout: 1000 }).catch(() => {});
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
    const s = document.querySelector<HTMLElement>("#solved");
    const anim = [s, ...s.querySelectorAll<HTMLElement>("*")].map((e) => getComputedStyle(e).animationName).filter((n) => n !== "none");
    return { bumped: s.classList.contains("bump"), anim };
  });
  if ((await moves()) !== m0) fail(`${name}: ${label}: ${key} on a solved board changed the moves`);
  if (!cue.bumped || !cue.anim.length) fail(`${name}: ${label}: ${key} on a solved board should nudge the solved line (${JSON.stringify(cue)})`);
}
// Open a puzzle from Past puzzles and wait until it's on screen (its title may already match).
async function openPast(page, id) {
  await page.click('[data-nav="archive"]');
  await page.waitForSelector("#archive:not([hidden])");
  await page.evaluate((id) => [...document.querySelectorAll<HTMLElement>("#archive-list a")].find((b) => b.textContent.startsWith(`Puzzle ${id} `)).click(), id);
  await page.waitForFunction((id) => !document.querySelector<HTMLElement>(".play").hidden && document.querySelector<HTMLElement>("#level-title").textContent === `Puzzle ${id}`, id);
}
// Past puzzles' "solved in ..." for a puzzle ("" if unsolved), opening the list first.
async function archiveDone(page, id) {
  await page.click('[data-nav="archive"]');
  await page.waitForSelector("#archive:not([hidden])");
  return page.evaluate((id) => [...document.querySelectorAll<HTMLElement>("#archive-list a")].find((b) => b.textContent.startsWith(`Puzzle ${id} `))?.querySelector<HTMLElement>(".done")?.textContent ?? "", id);
}
const stubClipboard = (page) => page.evaluate(() => {
  window.__copied = "";
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t) => { window.__copied = t; } } });
});

// Page height and footer position, to compare during play with solved.
const pageBox = (page) => page.evaluate(() => ({
  height: document.documentElement.scrollHeight,
  footer: Math.round(document.querySelector<HTMLElement>(".foot").getBoundingClientRect().top + window.scrollY),
}));
function expectSameBox(name, label, playing, solved) {
  if (solved.height > playing.height || solved.footer !== playing.footer)
    fail(`${name}: ${label}: the solved line should not grow the page or move the footer (during play ${JSON.stringify(playing)}, solved ${JSON.stringify(solved)})`);
  else console.log(`${name}: page ${solved.height}px, footer at ${solved.footer}px, same as during play`);
}

// The text of every live region on the play screen that isn't empty (lab#42).
const liveText = (page) => page.evaluate(() =>
  [...document.querySelectorAll<HTMLElement>(".play [aria-live], .play [role=status]")].map((e) => e.textContent.trim()).filter(Boolean));

async function play(page, moves) {
  for (const m of moves) await page.keyboard.press(KEY[m]);
}

async function session(browser, name, viewport, colorScheme) {
  const page = await newPage(browser, { viewport, colorScheme });
  page.on("console", (m) => m.type() === "error" && fail(`${name}: console error: ${m.text()}`));
  page.on("pageerror", (e) => fail(`${name}: page error: ${e.message}`));
  const res = await page.goto(base, { waitUntil: "networkidle" }).catch((e) => fail(`${name}: could not load ${base}: ${e.message}`));
  if (!res) return page.close();
  if (!(await page.waitForSelector(".cell", { timeout: 8000 }).catch(() => null))) {
    fail(`${name}: board never rendered`);
    return page.close();
  }

  // The display font (lab#36) is Afterstep's own file, and it loads.
  const font = {
    loaded: await page.evaluate(() => document.fonts.ready.then((fonts) => [...fonts].some((f) => f.family.replace(/"/g, "") === "Young Serif" && f.status === "loaded"))),
    files: page.fonts,
  };
  if (!font.loaded || !font.files.length || font.files.some((u) => new URL(u).origin !== new URL(base).origin))
    fail(`${name}: Young Serif should load from Afterstep's own origin, got ${JSON.stringify(font)}`);

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
  if (!copied.endsWith("\nhttps://afterstep.brightloopapps.com")) fail(`${name}: today's copied result should link to the home page, got "${copied.split("\n")[1]}"`);
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
  const page = await newPage(browser, { viewport });
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
      const el = document.activeElement as HTMLElement;
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
    const k = document.querySelector<HTMLElement>(".keys"), rows = new Map();
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
    const page = await newPage(browser, { viewport: { width, height: 844 } });
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
  const touch = await newPage(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await touch.goto(base, { waitUntil: "networkidle" }).catch((e) => fail(`${name}: could not load ${base}: ${e.message}`));
  await touch.waitForSelector(".cell", { timeout: 8000 }).catch(() => {});
  if ((await lines(touch)).visible) fail(`${name}: the keys hint should be hidden on a touch phone`);
  await touch.close();
  // A touch screen that reports a fine pointer: the first touch swaps the keys
  // hint for the d-pad (a mouse press doesn't).
  const fine = await newPage(browser, { viewport: { width: 390, height: 844 } });
  fine.on("pageerror", (e) => fail(`${name}: page error: ${e.message}`));
  await fine.goto(base, { waitUntil: "networkidle" }).catch((e) => fail(`${name}: could not load ${base}: ${e.message}`));
  await fine.waitForSelector(".cell", { timeout: 8000 }).catch(() => {});
  const shown = () => fine.evaluate(() => ({ dpad: getComputedStyle(document.querySelector<HTMLElement>(".dpad")).display !== "none", keys: !!document.querySelector<HTMLElement>(".keys").offsetParent }));
  const press = (pointerType) => fine.evaluate((pointerType) => document.querySelector<HTMLElement>("#board").dispatchEvent(new PointerEvent("pointerdown", { pointerType, bubbles: true })), pointerType);
  await press("mouse");
  let got = await shown();
  if (got.dpad || !got.keys) fail(`${name}: a mouse press should keep the keys hint and no d-pad (${JSON.stringify(got)})`);
  await press("touch");
  got = await shown();
  if (!got.dpad || got.keys) fail(`${name}: after a touch on a fine-pointer screen the d-pad should show and the keys hint hide (${JSON.stringify(got)})`);
  await fine.close();
}

// Touch (phone): tapping controls works, keeps the page still, and leaves no
// focus ring on the board.
async function touchControls(browser, name, viewport) {
  const page = await newPage(browser, { viewport, hasTouch: true, isMobile: true });
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
    const c = document.querySelector<HTMLElement>(".controls");
    return {
      dpad: document.querySelector<HTMLElement>(".dpad").getBoundingClientRect().top + window.scrollY,
      rows: new Set([...c.querySelectorAll<HTMLElement>("button")].map((b) => Math.round(b.getBoundingClientRect().top))).size,
      overflow: c.scrollWidth > c.clientWidth,
    };
  });
  const short = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".top nav button, .controls button, .dpad button")]
    .filter((b) => b.offsetParent && b.getBoundingClientRect().height < 44).map((b) => `${b.textContent} (${b.getBoundingClientRect().height}px)`));
  if (short.length) fail(`${name}: touch targets under 44px tall: ${short.join(", ")}`);
  const withHint = await layout();
  await page.evaluate(() => (document.querySelector<HTMLElement>("#hint").style.display = "none"));
  const withoutHint = await layout();
  await page.evaluate(() => (document.querySelector<HTMLElement>("#hint").style.display = ""));
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
    const { id, ring } = await page.evaluate(() => ({ id: document.activeElement.id, ring: document.querySelector<HTMLElement>("#board").matches(":focus-visible") }));
    if (id !== "board") fail(`${name}: tapping ${sel} should hand focus back to the board, "${id}" has it`);
    if (ring) fail(`${name}: tapping ${sel} left a focus ring on the board`);
    if (kind === "nudge") {
      const text = await page.textContent("#hint-note");
      if (text !== "Stand on plate A to open door A.") fail(`${name}: first Hint tap in lesson 1 should nudge, got "${text}"`);
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
  await page.waitForFunction(() => document.querySelector<HTMLElement>("#level-title").textContent.startsWith("Puzzle "));
  const before = await layout();
  await page.tap("#hint");
  await page.waitForSelector("#hint-note:not([hidden])");
  const fit = await page.evaluate(() => {
    const n = document.querySelector<HTMLElement>("#hint-note"), s = document.querySelector<HTMLElement>(".status");
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
    const dpad = document.querySelector<HTMLElement>(".dpad");
    return {
      solved: r("#solved-actions"), controls: r(".controls"), dpad: getComputedStyle(dpad).visibility === "visible" ? r(".dpad") : null, dpadPlace: r(".dpad"),
      status: r(".status-row"), text: r("#solved-text"), wide: document.documentElement.scrollWidth > window.innerWidth,
      height: document.documentElement.scrollHeight, footer: Math.round(document.querySelector<HTMLElement>(".foot").getBoundingClientRect().top + window.scrollY),
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
  await page.evaluate(() => document.querySelector<HTMLDialogElement>("#win").close());
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
// moves), get stuck in lesson 4 and take the offered undo, then use hints on
// today's puzzle and a past one, each counted as a move in the result.
async function hintFlow(browser, name, viewport) {
  const page = await newPage(browser, { viewport });
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
  const expectNudge = async (label, want?) => {
    const m0 = await moves();
    await page.keyboard.press("KeyH");
    const text = await noteText();
    if (!(await page.isVisible("#hint-note")) || (want ? text !== want : text.startsWith("Hint: ") || !text.endsWith(".")))
      fail(`${name}: ${label}: first hint should nudge${want ? ` "${want}"` : ""}, got "${text}"`);
    if (await page.isVisible("#board .hint-mark")) fail(`${name}: ${label}: a nudge should not mark a move`);
    if (await page.locator(".hinted").count()) fail(`${name}: ${label}: a nudge should not light up a button`);
    if ((await moves()) !== m0) fail(`${name}: ${label}: a nudge should not make a move`);
    const live = await page.evaluate(() => document.querySelector<HTMLElement>("#hint-note").closest("[aria-live]")?.getAttribute("aria-live"));
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
  for (const [lesson, best, nudge] of [[1, 5, "Stand on plate A to open door A."], [2, 6, echoA], [3, 12, echoA]]) {
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
    const n = document.querySelector<HTMLElement>("#hint-note"), s = document.querySelector<HTMLElement>(".status");
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
  await expectNudge("lesson 4 after the undo", "You hold plate A, your echo holds plate B.");
  await page.screenshot({ path: join(out, `${name}-nudge.png`) });
  if (!(await followHints("lesson 4"))) {
    fail(`${name}: following hints after the undo did not solve lesson 4`);
    return page.close();
  }
  await page.click("#next"); // "Next lesson"

  // Lesson 5: the nudge names the door that stops the echo and why, and hints
  // solve it in its shortest 9 moves.
  await expectNudge("lesson 5", "Door A keeps your echo on plate B for you.");
  if (!(await followHints("lesson 5"))) {
    fail(`${name}: following hints did not solve lesson 5`);
    return page.close();
  }
  if ((await page.textContent("#moves")).match(/Moves\s*(\d+)/)?.[1] !== "9") fail(`${name}: hints should solve lesson 5 in 9 moves, took ${await moves()}`);
  await page.click("#next"); // "Play today's puzzle"

  // Today's puzzle (lab#25): a nudge, then one hint (pressed twice at the same
  // spot) for the last move. The nudge is free; the hint counts as one move.
  // Wait for it to load: lesson 5's cells stay on screen until it does, and
  // keys there do nothing.
  const onToday = () => page.waitForFunction((t) => !document.querySelector<HTMLElement>(".play").hidden && document.querySelector<HTMLElement>("#level-title").textContent === t, `Puzzle ${level.id}`);
  await onToday();
  await play(page, level.solution.slice(0, -1));
  await expectNudge("today's puzzle", nudges[`daily/${today}`]);
  await page.click("#hint");
  await page.keyboard.press("KeyH");
  const last = level.solution.at(-1);
  if ((await page.getAttribute("#board .hint-mark", "data-hint")) !== String("UDLR.".indexOf(last)))
    fail(`${name}: hint before the last move should point at ${last}`);
  if ((await moves()) !== level.par) fail(`${name}: one hint should count as one move (moves ${await moves()}, wanted ${level.par})`);
  await page.screenshot({ path: join(out, `${name}-daily-hint.png`) });

  // Leaving and coming back, a reload and Start over all keep the hint: the
  // puzzle starts again at move 1. Each way back to the start gives the nudge
  // first, free (lab#29), and the H after that is a counted hint.
  await page.click('[data-nav="learn"]');
  await page.waitForFunction(() => document.querySelector<HTMLElement>("#level-title").textContent.startsWith("Plates"));
  await page.click('[data-nav="today"]');
  await onToday();
  if ((await moves()) !== 1) fail(`${name}: after How to play and back to Today the hint should still count (moves ${await moves()}, wanted 1)`);
  await expectNudge("today's puzzle after How to play and back", nudges[`daily/${today}`]);
  if ((await moves()) !== 1) fail(`${name}: the nudge after How to play and back should be free (moves ${await moves()}, wanted 1)`);
  await page.reload({ waitUntil: "networkidle" });
  await onToday();
  if ((await moves()) !== 1) fail(`${name}: after a reload the hint should still count (moves ${await moves()}, wanted 1)`);
  await expectNudge("today's puzzle after a reload", nudges[`daily/${today}`]);
  if ((await moves()) !== 1) fail(`${name}: the nudge after a reload should be free (moves ${await moves()}, wanted 1)`);
  await play(page, level.solution[0]);
  await page.click("#restart");
  if ((await moves()) !== 1) fail(`${name}: after Start over the hint should still count (moves ${await moves()}, wanted 1)`);
  await expectNudge("today's puzzle after Start over", nudges[`daily/${today}`]);
  if ((await moves()) !== 1) fail(`${name}: the nudge after Start over should be free (moves ${await moves()}, wanted 1)`);
  await page.screenshot({ path: join(out, `${name}-daily-nudge-after-start-over.png`) });
  // Start over again right after it: the nudge again, still free.
  await page.click("#restart");
  await expectNudge("today's puzzle after a second Start over", nudges[`daily/${today}`]);
  if ((await moves()) !== 1) fail(`${name}: the nudge after a second Start over should be free (moves ${await moves()}, wanted 1)`);
  await play(page, level.solution.slice(0, -1));
  await page.keyboard.press("KeyH");
  if (!(await noteText()).startsWith("Hint: ")) fail(`${name}: back on today's puzzle with a hint used, H should hint a move, got "${await noteText()}"`);
  if ((await moves()) !== level.par + 1) fail(`${name}: a second hint should count too (moves ${await moves()}, wanted ${level.par + 1})`);
  await page.keyboard.press(KEY[last]);
  if (!(await dialogOpens(page))) {
    fail(`${name}: today's puzzle not won after following the hint`);
    return page.close();
  }
  // Won at par with two hints: 2 more moves, "Solved" (not "Perfect") and no star.
  const total = level.par + 2;
  const title = await page.textContent("#win-title");
  if (title !== "Solved") fail(`${name}: a hinted solve should be titled "Solved", got "${title}"`);
  const body = await page.textContent("#win-body");
  if (!body.includes(`in ${total} moves with 2 hints. Par is ${level.par}.`)) fail(`${name}: win dialog should say "in ${total} moves with 2 hints", got "${body}"`);
  const copy = async () => {
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t) => { window.__copied = t; } } });
    });
    await page.click("#share");
    return page.evaluate(() => window.__copied ?? "");
  };
  const copied = await copy();
  if (!copied.startsWith(`Afterstep #${level.id}: ${total} moves with 2 hints (par ${level.par})\n`)) fail(`${name}: copied result should say "${total} moves with 2 hints" with no star, got "${copied.split("\n")[0]}"`);
  await page.screenshot({ path: join(out, `${name}-daily-won-hint.png`) });
  await page.keyboard.press("Escape");
  // The solved line says what the dialog said, hints and all, and copies the same.
  await expectSolved(page, name, "today's puzzle with hints", `Solved in ${total} moves with 2 hints, par ${level.par}`, "Past puzzles");
  await page.evaluate(() => (window.__copied = ""));
  await page.click("#solved-share");
  if ((await page.evaluate(() => window.__copied)) !== copied) fail(`${name}: the solved line should copy "with 2 hints" like the dialog did`);
  const todayRow = await archiveDone(page, level.id);
  if (todayRow !== `solved in ${total} with 2 hints`) fail(`${name}: Past puzzles should say "solved in ${total} with 2 hints" for today, got "${todayRow}"`);
  else console.log(`${name}: Past puzzles: "${todayRow}"`);
  await page.screenshot({ path: join(out, `${name}-past-puzzles-hints.png`) });

  // A past puzzle counts its hint the same way.
  const pastDate = readdirSync(join(repo, "levels/daily")).map((f) => f.replace(".json", "")).filter((d) => d < today).sort()[0];
  if (pastDate) {
    const past = JSON.parse(readFileSync(join(repo, "levels/daily", `${pastDate}.json`), "utf8"));
    const pastLine = `Solved in ${past.par + 1} moves with 1 hint, par ${past.par}`;
    const pastShare = `Afterstep #${past.id}: ${past.par + 1} moves with 1 hint (par ${past.par})\n`;
    await openPast(page, past.id);
    await play(page, past.solution.slice(0, -1));
    await expectNudge(`past puzzle ${pastDate}`);
    await page.keyboard.press("KeyH");
    await page.keyboard.press(KEY[past.solution.at(-1)]);
    if (!(await dialogOpens(page))) fail(`${name}: past puzzle ${pastDate} not won after a hint`);
    else {
      const pastTitle = await page.textContent("#win-title");
      const pastBody = await page.textContent("#win-body");
      const pastCopy = await copy();
      if (pastTitle !== "Solved" || !pastBody.includes(`in ${past.par + 1} moves with 1 hint.`) || !pastCopy.startsWith(pastShare))
        fail(`${name}: past puzzle ${pastDate} won at par with a hint should be "Solved" in ${past.par + 1} moves with 1 hint and no star ("${pastTitle}" / "${pastBody}" / "${pastCopy.split("\n")[0]}")`);
      await page.keyboard.press("Escape");
      await expectSolved(page, name, `past puzzle ${pastDate}`, pastLine, "Past puzzles");
      // Reopen it from Past puzzles: the same solved line, from the saved best.
      await page.click("#solved-next");
      if (await page.isHidden("#archive")) fail(`${name}: the solved line's Next on a past puzzle should open Past puzzles`);
      await openPast(page, past.id);
      await expectSolved(page, name, `reopened past puzzle ${pastDate}`, pastLine, "Past puzzles");
      const reCopy = await page.evaluate(() => {
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t) => { window.__copied = t; } } });
        document.querySelector<HTMLElement>("#solved-share").click();
        return new Promise((r) => setTimeout(() => r(window.__copied), 50));
      });
      if (!reCopy.startsWith(pastShare)) fail(`${name}: copying reopened past puzzle ${pastDate} should give its saved best with its hint, got "${reCopy.split("\n")[0]}"`);
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

// A save from before hints counted (lab#25): today solved in par + 1 with no
// hint field. It loads and shows as before; a later solve at par with two hints
// (par + 2 with them counted) is worse and leaves it in place.
async function oldSave(browser, name, viewport) {
  const page = await newPage(browser, { viewport });
  page.on("console", (m) => m.type() === "error" && fail(`${name}: console error: ${m.text()}`));
  page.on("pageerror", (e) => fail(`${name}: page error: ${e.message}`));
  const saved = JSON.stringify({ learned: true, results: { [today]: level.par + 1 } });
  await page.addInitScript((s) => location.protocol.startsWith("http") && !localStorage.getItem("afterstep:v1") && localStorage.setItem("afterstep:v1", s), saved);
  await page.goto(base, { waitUntil: "networkidle" }).catch((e) => fail(`${name}: could not load ${base}: ${e.message}`));
  if (!(await page.waitForSelector(".cell", { timeout: 8000 }).catch(() => null))) {
    fail(`${name}: board never rendered`);
    return page.close();
  }
  const before = `Solved in ${level.par + 1} moves, par ${level.par}`;
  await expectSolved(page, name, "today from an old save", before, "Past puzzles");
  const row = await archiveDone(page, level.id);
  if (row !== `solved in ${level.par + 1}`) fail(`${name}: Past puzzles should show the old result as before ("solved in ${level.par + 1}"), got "${row}"`);
  await openPast(page, level.id);
  await page.click("#restart");
  // Two moves from the end: the nudge, then follow two hints to the win.
  await play(page, level.solution.slice(0, -2));
  await page.keyboard.press("KeyH");
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press("KeyH");
    const m = await page.getAttribute("#board .hint-mark", "data-hint");
    if (m === null) {
      fail(`${name}: hint ${i + 1} showed no move`);
      return page.close();
    }
    await page.keyboard.press(KEY["UDLR."[m]]);
  }
  if (!(await dialogOpens(page))) {
    fail(`${name}: today's puzzle not won by following two hints`);
    return page.close();
  }
  const body = await page.textContent("#win-body");
  if (!body.includes(`in ${level.par + 2} moves with 2 hints.`)) fail(`${name}: win dialog should say "in ${level.par + 2} moves with 2 hints", got "${body}"`);
  await page.keyboard.press("Escape");
  const kept = await archiveDone(page, level.id);
  if (kept !== `solved in ${level.par + 1}`) fail(`${name}: a worse hinted solve should not replace the saved ${level.par + 1}, Past puzzles says "${kept}"`);
  await openPast(page, level.id);
  await expectSolved(page, name, "reopened after a worse hinted solve", before, "Past puzzles");
  console.log(`${name}: an old save's "solved in ${level.par + 1}" stays after a solve in ${level.par + 2} with 2 hints`);
  await page.close();
}

// All five lessons in a row, by keyboard or by tapping the d-pad. Each says
// "Lesson n of 5"; lessons 1-4 lead to the next, lesson 5 to today's puzzle.
// Lesson 5 can only be won by letting the echo bump door a while it stands on
// plate B: check it does, that the board and d-pad fit like lesson 4's, and
// that its tip reads as one balanced block. Its live regions say only news.
const LESSONS = ["RRRRR", "RRLDDD", "RRRRLLLDUDDD", "RRLDDDDD", "RRLDDDDDR"];

// The play screen's parts that must be on screen together on a phone (lab#10).
const FIT = { board: "#board", status: ".status-row", controls: ".controls", dpad: ".dpad" };
const playBoxes = (page) => page.evaluate((sel) => {
  const out = { scrollY: window.scrollY, width: window.innerWidth, height: window.innerHeight };
  for (const [k, s] of Object.entries(sel)) {
    const b = document.querySelector(String(s)).getBoundingClientRect();
    out[k] = { left: b.left, top: b.top + window.scrollY, right: b.right, bottom: b.bottom + window.scrollY, width: b.width, height: b.height };
  }
  return out;
}, FIT);
/** Fails unless every part of the play screen is inside the viewport at scroll 0. */
function expectFits(name, label, at) {
  for (const k of Object.keys(FIT)) {
    const b = at[k];
    if (!b.height) fail(`${name}: ${label}: the ${k} isn't showing`);
    else if (b.top < -0.5 || b.left < -0.5 || b.bottom > at.height + 0.5 || b.right > at.width + 0.5)
      fail(`${name}: ${label}: the ${k} (${Math.round(b.left)},${Math.round(b.top)}-${Math.round(b.right)},${Math.round(b.bottom)}) is outside the ${at.width}x${at.height} screen`);
  }
}
async function lessons(browser, name, viewport, colorScheme, touch) {
  const page = await newPage(browser, { viewport, colorScheme, hasTouch: touch, isMobile: touch });
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
  // On a phone the board, status line, controls and d-pad fit the screen (lab#10).
  const fits = async (label) => {
    if (!touch) return;
    const at = await playBoxes(page);
    expectFits(name, label, at);
    return at;
  };
  let four, lowest = 0;
  for (const [i, sol] of LESSONS.entries()) {
    const n = i + 1;
    const sub = await page.textContent("#level-sub");
    if (sub !== `Lesson ${n} of 5`) fail(`${name}: lesson ${n} should say "Lesson ${n} of 5", says "${sub}"`);
    const at = await layout();
    if (at.wide) fail(`${name}: lesson ${n} scrolls sideways`);
    const fit = await fits(`lesson ${n}`);
    if (fit) console.log(`${name}: lesson ${n} fits, d-pad ends at ${Math.round(fit.dpad.bottom)}px of ${viewport.height}, cells ${at.cell.toFixed(1)}px`);
    if (n === 4) {
      four = at;
      // Tips name plates in full, like the nudges (lab#29).
      if ((await page.textContent("#tip")) !== "You hold plate A yourself. Your echo holds plate B.") fail(`${name}: lesson 4 tip should name plate B in full, says "${await page.textContent("#tip")}"`);
    }
    if (n < 5) lowest = Math.max(lowest, at.dpad.bottom);
    if (n === 5) {
      if ((await page.textContent("#level-title")) !== "Out of step") fail(`${name}: lesson 5 should be "Out of step"`);
      if ((await page.textContent("#tip")) !== "A closed door stops your echo. Keep it on plate B.") fail(`${name}: lesson 5 tip should explain the bump, naming plate B in full`);
      if (at.board.right > viewport.width || at.board.left < 0 || at.dpad.right > viewport.width) fail(`${name}: lesson 5 board or d-pad is off screen`);
      if (at.board.height !== four.board.height || at.cell !== four.cell) fail(`${name}: lesson 5 board (${at.board.height}px, cells ${at.cell}px) should match lesson 4's (${four.board.height}px, ${four.cell}px)`);
      if (at.dpad.bottom > lowest + 0.5) fail(`${name}: lesson 5's d-pad ends at ${at.dpad.bottom}px, lower than any other lesson's (${lowest}px)`);
      console.log(`${name}: lesson 5 board ${at.board.width}x${at.board.height}, d-pad ends at ${Math.round(at.dpad.bottom)}px of ${viewport.height} (lessons 1-4: ${Math.round(lowest)}px)`);
      await page.screenshot({ path: join(out, `${name}-lesson5.png`) });
    }
    if (n === 5) {
      const outside = await page.evaluate(() => ["#moves", "#echo-status"].filter((s) => document.querySelector(s).closest("[aria-live], [role=status]")));
      if (outside.length) fail(`${name}: ${outside.join(" and ")} should be outside every live region, so plain steps say nothing`);
    }
    for (const [j, m] of [...sol].entries()) {
      await move(m);
      if (j === sol.length - 2) await fits(`lesson ${n}, before its last move`);
      // Lesson 5 (lab#42): what screen readers hear after a plain step, the
      // echo arriving as you press plate A, and the echo's bump on move 7.
      if (n === 5 && (j === 0 || j === 1 || j === 6)) {
        const want = ["", "Your echo appears. You press plate A. Door A opens.", "", "", "", "", "The echo bumps into door A."][j];
        const said = (await liveText(page)).join(" | ");
        if (said !== want) fail(`${name}: lesson 5 move ${j + 1}: the live regions should say "${want}", say "${said}"`);
      }
      // Lesson 5: on move 7 the echo bumps door a and stays on plate B.
      if (n === 5 && j === 6) {
        const st = await page.evaluate(() => ({
          bumped: document.querySelector<HTMLElement>(".piece.echo").classList.contains("bump"),
          onB: (() => { const e = document.querySelector<HTMLElement>(".piece.echo"); return e.style.getPropertyValue("--x") + "," + e.style.getPropertyValue("--y"); })(),
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
      if (touch) await page.evaluate(() => document.querySelector<HTMLDialogElement>("#win").close());
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
          sub: document.querySelector<HTMLElement>("#level-sub").textContent,
          moves: Number(document.querySelector<HTMLElement>("#moves").textContent.match(/Moves\s*(\d+)/)?.[1]),
          bumped: document.querySelector<HTMLElement>(".piece.player").classList.contains("bump"),
        }));
        if (after.sub !== "Lesson 2 of 5") fail(`${name}: double-tapping Next should open lesson 2, got "${after.sub}"`);
        if (after.moves !== 0 || after.bumped) fail(`${name}: a d-pad tap right after Next made a stray move in lesson 2 (moves ${after.moves}, bumped ${after.bumped})`);
        else console.log(`${name}: a d-pad tap right after tapping Next: no move`);
        await page.waitForTimeout(500); // the d-pad listens again after a moment
      }
    } else if (touch) await page.tap("#next");
    else await page.keyboard.press("Enter"); // the dialog's focused button is Copy result (hidden) or Next
  }
  await page.waitForFunction(() => document.querySelector<HTMLElement>("#level-title").textContent.startsWith("Puzzle "), null, { timeout: 4000 })
    .catch(() => fail(`${name}: "Play today's puzzle" after lesson 5 did not open today's puzzle`));
  const fit = await fits("today's puzzle");
  if (fit) {
    console.log(`${name}: today's puzzle fits, d-pad ends at ${Math.round(fit.dpad.bottom)}px of ${viewport.height}`);
    await page.screenshot({ path: join(out, `${name}-daily.png`) });
  }
  await page.close();
}

// Nudges (lab#29): tapping Hint on today's puzzle shows its nudge, and it and
// every other level's nudge, put in the same place, fit the status line on one
// line with 6% of it to spare (for wider system fonts), without moving the
// d-pad or scrolling sideways.
async function nudgesFit(page, name) {
  const dpad = () => page.evaluate(() => document.querySelector<HTMLElement>(".dpad").getBoundingClientRect().top + window.scrollY);
  const before = await dpad();
  await page.tap("#hint");
  await page.waitForSelector("#hint-note:not([hidden])");
  const real = await page.textContent("#hint-note");
  if (real !== nudges[`daily/${today}`]) fail(`${name}: tapping Hint on today's puzzle should show its nudge "${nudges[`daily/${today}`]}", got "${real}"`);
  await page.screenshot({ path: join(out, `${name}-daily-nudge.png`) });
  const sizes = await page.evaluate((texts) => {
    const n = document.querySelector<HTMLElement>("#hint-note"), s = document.querySelector<HTMLElement>(".status");
    const shown = n.textContent;
    const rows = texts.map(([key, text]) => {
      n.textContent = text;
      const r = n.getBoundingClientRect(), t = document.createRange();
      t.selectNodeContents(n);
      const w = t.getBoundingClientRect();
      return { key, text, textW: w.width, lines: w.height < 2 * parseFloat(getComputedStyle(n).fontSize) ? 1 : 2, inside: w.left >= r.left - 0.5 && w.right <= r.right + 0.5, wide: document.documentElement.scrollWidth > window.innerWidth };
    });
    n.textContent = shown;
    return { statusW: s.clientWidth, rows };
  }, Object.entries(nudges));
  const longest = sizes.rows.reduce((a, b) => (b.textW > a.textW ? b : a));
  for (const r of sizes.rows) {
    if (r.lines !== 1 || !r.inside || r.wide || r.textW > sizes.statusW * 0.94)
      fail(`${name}: the nudge for ${r.key} "${r.text}" should fit one line with 6% to spare: ${Math.round(r.textW)}px of ${sizes.statusW}px (${r.lines} lines${r.wide ? ", page scrolls sideways" : ""})`);
  }
  if ((await dpad()) !== before) fail(`${name}: today's nudge moved the d-pad`);
  console.log(`${name}: ${sizes.rows.length} nudges fit; longest "${longest.text}" (${longest.key}) ${Math.round(longest.textW)}px of ${sizes.statusW}px`);
}

// Fit (lab#10): every lesson and today's puzzle, opened by link on a touch
// phone, shows the board, status line, controls and d-pad without scrolling,
// and still does late in today's puzzle (once the echo follows), with the
// board the same size. In landscape the board sits beside the controls.
async function fitScreens(browser, name, viewport, colorScheme) {
  const page = await newPage(browser, { viewport, colorScheme, hasTouch: true, isMobile: true });
  page.on("console", (m) => m.type() === "error" && fail(`${name}: console error: ${m.text()}`));
  page.on("pageerror", (e) => fail(`${name}: page error: ${e.message}`));
  const landscape = viewport.width > viewport.height;
  // A returning player, so the bare URL opens today's puzzle rather than the lessons.
  await page.addInitScript(() => location.protocol.startsWith("http") && localStorage.setItem("afterstep:v1", JSON.stringify({ learned: true, results: {} })));
  for (const [label, hash] of [...LESSONS.map((_, i) => [`lesson ${i + 1}`, `#/learn/${i + 1}`]), ["today's puzzle", ""]]) {
    await page.goto("about:blank");
    await page.goto(`${base}/${hash}`, { waitUntil: "networkidle" }).catch((e) => fail(`${name}: could not load ${base}/${hash}: ${e.message}`));
    if (!(await page.waitForSelector(".cell", { timeout: 8000 }).catch(() => null))) {
      fail(`${name}: board never rendered for ${label}`);
      continue;
    }
    const sub = await page.textContent("#level-sub");
    if (hash ? sub !== `Lesson ${hash.at(-1)} of 5` : !(await page.textContent("#level-title")).startsWith("Puzzle ")) fail(`${name}: ${hash || "/"} opened "${sub}"`);
    const at = await playBoxes(page);
    expectFits(name, label, at);
    if (landscape && at.board.right > Math.min(at.controls.left, at.dpad.left) + 0.5) fail(`${name}: ${label}: the board should sit beside the controls`);
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) fail(`${name}: ${label} scrolls sideways`);
    if (label === "lesson 5") await page.screenshot({ path: join(out, `${name}-lesson5.png`) });
    if (!hash) {
      await page.screenshot({ path: join(out, `${name}-daily.png`) });
      await nudgesFit(page, name);
      await play(page, level.solution.slice(0, -1));
      await page.waitForTimeout(200);
      const late = await playBoxes(page);
      expectFits(name, "late in today's puzzle", late);
      if (Math.abs(late.board.height - at.board.height) > 0.5) fail(`${name}: the board changed size during today's puzzle (${at.board.height}px -> ${late.board.height}px)`);
      await page.screenshot({ path: join(out, `${name}-daily-late.png`) });
      console.log(`${name}: everything fits; board ${Math.round(at.board.width)}x${Math.round(at.board.height)}, d-pad ends at ${Math.round(late.dpad.bottom)}px of ${viewport.height}`);
    }
  }
  if (landscape) {
    // Lesson 1, played by tapping the d-pad beside the board.
    await page.goto("about:blank");
    await page.goto(`${base}/#/learn/1`, { waitUntil: "networkidle" });
    await page.waitForSelector(".cell");
    for (let i = 0; i < 5; i++) await page.tap('.dpad [data-move="3"]');
    if (!(await dialogOpens(page))) fail(`${name}: lesson 1 not solved by tapping Right five times`);
  }
  await page.close();
}

// ── Likes (lab#17) ──────────────────────────────────────────────────────────
// Every page talks to a mocked lab like API (never the live one), and may only
// ask Afterstep's own origin and lab.brightloopapps.com/api/likes. Afterstep
// serves its own font (lab#36), so Google Fonts isn't allowed either.
const LAB = "https://lab.brightloopapps.com";

/** A stateful stand-in for the hub's /api/likes, on a page or a whole browser
 *  context. `mode`: "ok", "resting" (what the live hub answers until its
 *  migration: 204 to a quiet GET, 503 otherwise), "down" (unreachable) or "slow"
 *  (answers after 8 s). `next` forces the status of the next POST or DELETE
 *  (409, 429). `delay` holds each POST and DELETE. `network`: like the live API,
 *  a second like while this network's like stands answers 409. */
async function mockLikes(target, opts = {}) {
  const api = { mode: "ok", total: 12, delay: 0, next: null, network: false, receipts: [], calls: [], ...opts };
  const origin = new URL(base).origin;
  await target.route(`${LAB}/**`, async (route) => {
    const req = route.request(), url = new URL(req.url()), method = req.method();
    const cors = { "access-control-allow-origin": origin, vary: "Origin", "cache-control": "no-store" };
    const send = (status, body) => route.fulfill({ status, headers: cors, contentType: "application/json", body: body === undefined ? undefined : JSON.stringify(body) }).catch(() => {});
    api.calls.push({ method, path: url.pathname + url.search, body: req.postData(), cookie: req.headers().cookie });
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { ...cors, "access-control-allow-methods": "POST, DELETE", "access-control-allow-headers": "content-type" } });
    if (api.mode === "down") return route.abort("failed");
    if (api.mode === "slow") return setTimeout(() => send(200, { afterstep: { total: api.total, week: 1 } }), 8000);
    if (api.mode === "resting") return method === "GET" && url.searchParams.has("quiet") ? route.fulfill({ status: 204, headers: cors }) : send(503, { error: "Likes are resting right now. Try again later." });
    if (method === "GET" && url.pathname === "/api/likes") return send(200, { afterstep: { total: api.total, week: 3 }, inkchime: { total: 4, week: 1 } });
    if (url.pathname !== "/api/likes/afterstep") return send(404, { error: "Unknown project." });
    if (api.delay) await new Promise((r) => setTimeout(r, api.delay));
    const forced = api.next;
    api.next = null;
    if (forced === 429) return send(429, { error: "That's a lot of likes. Try again in a minute." });
    const counts = () => ({ total: api.total, week: 3 });
    if (method === "POST") {
      if (forced === 409 || (api.network && api.receipts.length)) return send(409, { error: "This network already liked it today.", ...counts() });
      const receipt = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
      api.receipts.push(receipt);
      api.total++;
      return send(200, { receipt, ...counts() });
    }
    if (method === "DELETE") {
      const { receipt } = JSON.parse(req.postData() || "{}");
      if (!api.receipts.includes(receipt)) return send(404, { error: "That like wasn't found.", ...counts() });
      api.receipts = api.receipts.filter((r) => r !== receipt);
      api.total--;
      return send(200, { ok: true, ...counts() });
    }
    return send(405, { error: "Use POST or DELETE." });
  });
  return api;
}

/** A new page with the like API mocked (working, 12 likes, unless `likes` says
 *  otherwise) that fails the run on a request to anywhere else. */
async function newPage(browser, opts, likes = {}) {
  const page = guard(await browser.newPage(opts));
  page.likes = await mockLikes(page, likes);
  return page;
}
function guard(page) {
  const own = new URL(base).origin;
  page.fonts = [];
  page.on("request", (r) => {
    const u = r.url();
    if (r.resourceType() === "font") page.fonts.push(u);
    if (u.startsWith("data:") || u.startsWith("blob:") || new URL(u).origin === own) return;
    if (!u.startsWith(`${LAB}/api/likes`)) fail(`request to somewhere other than Afterstep and the like API: ${u}`);
  });
  return page;
}

// Liking, reloading and unliking (also on a later day, by the stored receipt),
// the win dialog's heart, 409 and 429, keyboard and labels, no cookies; the page
// is no taller with the heart at 390x844 (lessons and today's puzzle, with and
// without touch); and with the API resting (503), unreachable or slow, the game
// plays, nothing waits, the heart never shows and nothing errors.
async function likesFlow(browser) {
  const name = "likes";
  const desk = await newPage(browser, { viewport: { width: 1280, height: 900 } });
  const api = desk.likes;
  // The only console errors allowed: the browser's own lines for the 409 and 429 answers below.
  desk.on("console", (m) => m.type() === "error" && !/status of (409|429)/.test(m.text()) && fail(`${name}: console error: ${m.text()}`));
  desk.on("pageerror", (e) => fail(`${name}: page error: ${e.message}`));
  await desk.goto(base, { waitUntil: "networkidle" });
  await desk.waitForSelector(".cell", { timeout: 8000 });
  const heart = (sel = "#like-foot") => desk.evaluate((sel) => {
    const b = document.querySelector(sel);
    return { shown: !!b.offsetParent, pressed: b.getAttribute("aria-pressed"), label: b.getAttribute("aria-label"), n: b.querySelector(".like-n").textContent };
  }, sel);
  const stored = () => desk.evaluate(() => JSON.parse(localStorage.getItem("afterstep:like") || "null"));
  await desk.waitForSelector("#like-foot:not([hidden])", { timeout: 3000 }).catch(() => fail(`${name}: the footer heart should show once the counts load`));
  let h = await heart();
  if (h.label !== "Like Afterstep, 12 likes" || h.pressed !== "false" || h.n !== "12") fail(`${name}: the heart should read "Like Afterstep, 12 likes", not pressed (got ${JSON.stringify(h)})`);
  if (api.calls[0]?.path !== "/api/likes?quiet=1") fail(`${name}: counts should be asked for quietly, asked ${api.calls[0]?.path}`);

  // Keyboard: Tab from the board reaches the heart; Enter likes it, at once, before the API answers.
  await desk.focus("#board");
  for (let i = 0; i < 20 && (await desk.evaluate(() => document.activeElement.id)) !== "like-foot"; i++) await desk.keyboard.press("Tab");
  if ((await desk.evaluate(() => document.activeElement.id)) !== "like-foot") fail(`${name}: Tab from the board should reach the heart`);
  api.delay = 400;
  await desk.keyboard.press("Enter");
  h = await heart();
  if (h.pressed !== "true" || h.label !== "Like Afterstep, 13 likes") fail(`${name}: liking should show at once (got ${JSON.stringify(h)})`);
  await desk.waitForFunction(() => !document.querySelector<HTMLElement>("#like-foot").hasAttribute("aria-busy"));
  api.delay = 0;
  if ((await desk.evaluate(() => document.activeElement.id)) !== "like-foot") fail(`${name}: a keyboard like should keep focus on the heart`);
  const s = await stored();
  if (!s?.liked || s.receipt !== api.receipts[0]) fail(`${name}: the like's receipt should be stored with the liked state (stored ${JSON.stringify(s)})`);
  await desk.locator(".foot").screenshot({ path: join(out, `${name}-foot-liked.png`) });

  // A reload keeps it.
  await desk.reload({ waitUntil: "networkidle" });
  await desk.waitForSelector("#like-foot:not([hidden])", { timeout: 3000 }).catch(() => {});
  h = await heart();
  if (h.pressed !== "true" || h.label !== "Like Afterstep, 13 likes") fail(`${name}: the like should survive a reload (got ${JSON.stringify(h)})`);

  // Unlike by mouse: the stored receipt goes with DELETE, and focus goes back to the board.
  await desk.click("#like-foot");
  await desk.waitForFunction(() => !document.querySelector<HTMLElement>("#like-foot").hasAttribute("aria-busy"));
  const del = api.calls.findLast((c) => c.method === "DELETE");
  if (!del || JSON.parse(del.body).receipt !== s?.receipt) fail(`${name}: unliking should send the stored receipt (sent ${del?.body})`);
  h = await heart();
  if (h.pressed !== "false" || h.label !== "Like Afterstep, 12 likes") fail(`${name}: unliking should show 12, not pressed (got ${JSON.stringify(h)})`);
  if ((await stored()) !== null) fail(`${name}: unliking should forget the receipt`);
  if ((await desk.evaluate(() => document.activeElement.id)) !== "board") fail(`${name}: clicking the heart should hand focus back to the board`);

  // A later day: like, then pretend the date moved on. The receipt has no date, so unlike still works.
  await desk.click("#like-foot");
  await desk.waitForFunction(() => document.querySelector<HTMLElement>("#like-foot").getAttribute("aria-pressed") === "true" && !document.querySelector<HTMLElement>("#like-foot").hasAttribute("aria-busy"));
  await desk.clock.install({ time: new Date(Date.now() + 3 * 24 * 3600 * 1000) }).catch(() => {});
  await desk.reload({ waitUntil: "load" });
  await desk.waitForSelector("#like-foot:not([hidden])", { timeout: 3000 }).catch(() => {});
  await desk.click("#like-foot");
  await desk.waitForFunction(() => !document.querySelector<HTMLElement>("#like-foot").hasAttribute("aria-busy"));
  if ((await heart()).pressed !== "false" || api.receipts.length) fail(`${name}: unliking three days later should work by the stored receipt (${JSON.stringify(await heart())}, server still has ${api.receipts.length})`);
  await desk.close();

  // 409 and 429 roll back with a short note; the win dialog's heart and the footer's agree.
  const day = await newPage(browser, { viewport: { width: 1280, height: 900 } });
  day.on("console", (m) => m.type() === "error" && !/status of (409|429)/.test(m.text()) && fail(`${name}: console error: ${m.text()}`));
  day.on("pageerror", (e) => fail(`${name}: page error: ${e.message}`));
  await day.goto(base, { waitUntil: "networkidle" });
  await day.waitForSelector(".cell", { timeout: 8000 });
  await day.click('[data-nav="today"]');
  await day.waitForFunction(() => document.querySelector<HTMLElement>("#level-title").textContent.startsWith("Puzzle "));
  await play(day, level.solution);
  if (!(await dialogOpens(day))) fail(`${name}: today's puzzle not solved`);
  const dlg = await day.evaluate(() => ({ ask: document.querySelector<HTMLElement>("#win-like").offsetParent ? document.querySelector<HTMLElement>("#win-like-ask").textContent : null, focus: document.activeElement.id }));
  if (dlg.ask !== "Enjoyed today's puzzle?") fail(`${name}: the win dialog should ask "Enjoyed today's puzzle?" with its heart (got ${dlg.ask})`);
  if (dlg.focus !== "share") fail(`${name}: the win dialog should still open on Copy result, "${dlg.focus}" has focus`);
  day.likes.next = 409;
  await day.click("#like-win");
  await day.waitForFunction(() => !document.querySelector<HTMLElement>("#like-win").hasAttribute("aria-busy"));
  const n409 = await day.evaluate(() => ({ pressed: document.querySelector<HTMLElement>("#like-win").getAttribute("aria-pressed"), note: document.querySelector<HTMLElement>(".win-like-note").textContent, shown: !!document.querySelector<HTMLElement>(".win-like-note").offsetParent, live: document.querySelector<HTMLElement>("#like-live").textContent }));
  if (n409.pressed !== "false") fail(`${name}: a 409 should roll the like back`);
  if (!n409.shown || !/already liked it today/.test(n409.note) || n409.live !== n409.note) fail(`${name}: a 409 should say so politely under the heart and to screen readers (${JSON.stringify(n409)})`);
  await day.screenshot({ path: join(out, `${name}-dialog-409.png`) });
  await day.click("#like-win");
  await day.waitForFunction(() => !document.querySelector<HTMLElement>("#like-win").hasAttribute("aria-busy"));
  const both = await day.evaluate(() => [...document.querySelectorAll<HTMLElement>(".like")].map((b) => b.getAttribute("aria-pressed") + " " + b.getAttribute("aria-label")));
  if (both.join() !== "true Like Afterstep, 13 likes,true Like Afterstep, 13 likes") fail(`${name}: liking in the dialog should show in both hearts, got ${JSON.stringify(both)}`);
  if (await day.isVisible(".win-like-note")) fail(`${name}: the 409 note should go once a like goes through`);
  await day.screenshot({ path: join(out, `${name}-dialog-liked.png`) });
  await day.keyboard.press("Escape");
  day.likes.next = 429;
  await day.click("#like-foot");
  await day.waitForFunction(() => !document.querySelector<HTMLElement>("#like-foot").hasAttribute("aria-busy"));
  const n429 = await day.evaluate(() => ({ pressed: document.querySelector<HTMLElement>("#like-foot").getAttribute("aria-pressed"), note: document.querySelector<HTMLElement>(".foot-like-note").textContent, shown: !!document.querySelector<HTMLElement>(".foot-like-note").offsetParent }));
  if (n429.pressed !== "true" || !n429.shown || !/in a minute/.test(n429.note)) fail(`${name}: a 429 on unlike should keep the like and ask to try again in a minute (${JSON.stringify(n429)})`);
  await day.screenshot({ path: join(out, `${name}-foot-429.png`) });
  const cookies = await day.context().cookies();
  if (cookies.length || (await day.evaluate(() => document.cookie)) || day.likes.calls.some((c) => c.cookie)) fail(`${name}: there should be no cookies (${JSON.stringify(cookies)})`);
  await day.close();

  // 390x844: the heart pushes nothing down, in the lessons and today's puzzle, with and without touch.
  for (const touch of [false, true]) {
    const boxes: Record<string, any> = {};
    for (const mode of ["resting", "ok"]) {
      const p = await newPage(browser, { viewport: { width: 390, height: 844 }, hasTouch: touch, isMobile: touch }, { mode });
      await p.goto(base, { waitUntil: "networkidle" });
      await p.waitForSelector(".cell", { timeout: 8000 });
      if (mode === "ok") await p.waitForSelector("#like-foot:not([hidden])", { timeout: 3000 }).catch(() => fail(`${name}: no heart at 390px`));
      const box = () => p.evaluate(() => ({ height: document.documentElement.scrollHeight, footer: Math.round(document.querySelector<HTMLElement>(".foot").getBoundingClientRect().top + window.scrollY), dpad: Math.round(document.querySelector<HTMLElement>(".dpad").getBoundingClientRect().top + window.scrollY), board: Math.round(document.querySelector<HTMLElement>("#board").getBoundingClientRect().top + window.scrollY), wide: document.documentElement.scrollWidth > window.innerWidth }));
      const lesson = await box();
      await (touch ? p.tap('[data-nav="today"]') : p.click('[data-nav="today"]'));
      await p.waitForFunction(() => document.querySelector<HTMLElement>("#level-title").textContent.startsWith("Puzzle "));
      boxes[mode] = { lesson, daily: await box() };
      if (mode === "ok") await p.locator(".foot").screenshot({ path: join(out, `${name}-foot-390${touch ? "-touch" : ""}.png`) });
      await p.close();
    }
    const label = `${name} at 390x844${touch ? " (touch)" : ""}`;
    for (const where of ["lesson", "daily"]) {
      const [a, b] = [boxes.resting[where], boxes.ok[where]];
      if (b.wide) fail(`${label}: the heart makes ${where} scroll sideways`);
      if (a.height !== b.height || a.footer !== b.footer || a.dpad !== b.dpad || a.board !== b.board) fail(`${label}: the heart moved the ${where} page (${JSON.stringify(a)} -> ${JSON.stringify(b)})`);
    }
    console.log(`${label}: page ${boxes.ok.lesson.height}px in lessons and ${boxes.ok.daily.height}px in today's puzzle, with or without the heart`);
  }

  // Resting (the live hub until its migration), unreachable and slow: the game plays, the heart never shows.
  for (const mode of ["resting", "down", "slow"]) {
    const p = await newPage(browser, { viewport: { width: 1280, height: 900 } }, { mode });
    const label = `${name} with the API ${mode}`;
    // An unreachable API leaves the browser's own network line; nothing from the page itself.
    p.on("console", (m) => m.type() === "error" && !(mode === "down" && /^Failed to load resource: net::ERR_FAILED$/.test(m.text())) && fail(`${label}: console error: ${m.text()}`));
    p.on("pageerror", (e) => fail(`${label}: page error: ${e.message}`));
    await p.addInitScript(() => {
      window.__heartSeen = false;
      const look = () => {
        if ([...document.querySelectorAll<HTMLElement>(".like")].some((b) => b.offsetParent && !b.closest("[hidden]"))) window.__heartSeen = true;
        requestAnimationFrame(look);
      };
      requestAnimationFrame(look);
    });
    const t0 = Date.now();
    await p.goto(base, { waitUntil: "load" });
    if (!(await p.waitForSelector(".cell", { timeout: 3000 }).catch(() => null))) { fail(`${label}: the board should render without waiting for likes`); await p.close(); continue; }
    const painted = Date.now() - t0;
    await p.keyboard.press("ArrowRight");
    const moved = await p.evaluate(() => document.querySelector<HTMLElement>("#moves").textContent.match(/Moves\s*(\d+)/)?.[1]);
    if (moved !== "1") fail(`${label}: a move should work right away (moves ${moved})`);
    await p.waitForTimeout(mode === "slow" ? 7000 : 600); // the slow answer is given up on after 6 s
    if (await p.evaluate(() => window.__heartSeen)) fail(`${label}: the heart should never show`);
    if (!p.likes.calls.some((c) => c.path === "/api/likes?quiet=1")) fail(`${label}: the counts should have been asked for`);
    if (p.likes.calls.some((c) => c.method !== "GET")) fail(`${label}: nothing but the counts should be asked for`);
    console.log(`${label}: board in ${painted}ms, moves work, no heart`);
    await p.close();
  }
}

// Two tabs (lab#37): two pages in one browser context share localStorage and one
// mocked API that, like the live one, answers 409 to a second like from this
// network while the first stands.
async function likeTabs(browser) {
  const name = "like-tabs";
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const api = await mockLikes(ctx, { network: true });
  const tabs = [];
  for (const tab of ["A", "B"]) {
    const p = guard(await ctx.newPage());
    // The only console error allowed: the browser's own line for the 409 below.
    p.on("console", (m) => m.type() === "error" && !/status of 409/.test(m.text()) && fail(`${name} ${tab}: console error: ${m.text()}`));
    p.on("pageerror", (e) => fail(`${name} ${tab}: page error: ${e.message}`));
    await p.goto(base, { waitUntil: "networkidle" });
    await p.waitForSelector("#like-foot:not([hidden])", { timeout: 3000 }).catch(() => fail(`${name} ${tab}: the heart should show`));
    tabs.push(p);
  }
  const [a, b] = tabs;
  // Both hearts on the page (the footer's and the hidden win dialog's), and what is read out.
  const look = (p) => p.evaluate(() => ({
    hearts: [...document.querySelectorAll<HTMLElement>(".like")].map((h) => `${h.getAttribute("aria-pressed")} ${h.getAttribute("aria-label")} ${h.querySelector<HTMLElement>(".like-n").textContent}${h.hasAttribute("aria-busy") ? " busy" : ""}`),
    note: [...document.querySelectorAll<HTMLElement>(".like-note")].some((n) => !n.hidden) || document.querySelector<HTMLElement>("#like-live").textContent !== "",
  }));
  const want = (liked, n) => [0, 1].map(() => `${liked} Like Afterstep, ${n} ${n === 1 ? "like" : "likes"} ${n}`);
  const shows = async (p, tab, liked, n, why) => {
    const ok = await p.waitForFunction((w) => [...document.querySelectorAll<HTMLElement>(".like")].every((h, i) => `${h.getAttribute("aria-pressed")} ${h.getAttribute("aria-label")} ${h.querySelector<HTMLElement>(".like-n").textContent}` === w[i]), want(liked, n), { timeout: 2000 }).then(() => true, () => false);
    const got = await look(p);
    if (!ok || got.note) fail(`${name}: ${why}: tab ${tab} should show ${JSON.stringify(want(liked, n)[0])} with no note (got ${JSON.stringify(got)})`);
  };
  const settled = (p) => p.waitForFunction(() => !document.querySelector<HTMLElement>("#like-foot").hasAttribute("aria-busy"));

  // A likes: B follows, +1, without asking the API anything.
  await a.click("#like-foot");
  await settled(a);
  const asked = api.calls.length;
  await shows(b, "B", true, 13, "after a like in tab A");
  if (api.calls.length !== asked) fail(`${name}: tab B shouldn't ask the API to show A's like (${JSON.stringify(api.calls.slice(asked))})`);
  await a.locator(".foot").screenshot({ path: join(out, `${name}-a.png`) });
  await b.locator(".foot").screenshot({ path: join(out, `${name}-b.png`) });

  // B unlikes with A's receipt: A follows, -1.
  await b.click("#like-foot");
  await settled(b);
  const del = api.calls.findLast((c) => c.method === "DELETE");
  if (!del || api.receipts.length || api.total !== 12) fail(`${name}: tab B should unlike with A's receipt (sent ${del?.body}, server has ${api.receipts.length} likes, total ${api.total})`);
  await shows(a, "A", false, 12, "after an unlike in tab B");

  // A race: B likes, and A's like starts before B's comes back. A shows its press at
  // once, isn't flipped back when B's lands, and its 409 ends on B's like, counted once.
  api.delay = 800;
  await a.evaluate(() => {
    const h = document.querySelector<HTMLElement>("#like-foot");
    const seen = (window.__seen = []);
    const note = () => { const s = `${h.getAttribute("aria-pressed")} ${h.getAttribute("aria-label")}`; if (seen.at(-1) !== s) seen.push(s); };
    new MutationObserver(note).observe(h, { attributes: true, attributeFilter: ["aria-pressed", "aria-label"] });
  });
  await b.click("#like-foot");
  await a.waitForTimeout(250);
  await a.click("#like-foot");
  await settled(b);
  await settled(a);
  api.delay = 0;
  await shows(b, "B", true, 13, "after its like in the race");
  await shows(a, "A", true, 13, "after its like met B's");
  const seen = await a.evaluate(() => window.__seen);
  if (JSON.stringify(seen) !== JSON.stringify(["true Like Afterstep, 13 likes"])) fail(`${name}: tab A's heart should go to pressed, 13 once and stay there (went ${JSON.stringify(seen)})`);
  const stored = await a.evaluate(() => JSON.parse(localStorage.getItem("afterstep:like") || "null"));
  if (api.total !== 13 || api.receipts.length !== 1 || stored?.receipt !== api.receipts[0]) fail(`${name}: one like should stand, with its receipt stored (server ${api.total}, ${api.receipts.length} receipts, stored ${JSON.stringify(stored)})`);

  // A unlikes with B's receipt: both end unliked, and the server agrees.
  await a.click("#like-foot");
  await settled(a);
  await shows(b, "B", false, 12, "after the unlike in tab A");
  if (api.receipts.length || api.total !== 12) fail(`${name}: tab A should unlike with B's receipt (server has ${api.receipts.length}, total ${api.total})`);
  console.log(`${name}: likes and unlikes show in the other tab with no request; a like on its way isn't disturbed and counts once`);
  await ctx.close();
}

// Routes (lab#8): each screen has its own URL. Walks today -> Past puzzles -> a
// past puzzle -> lessons 1 and 2 by clicking, then Back, Forward and reload.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const HOME_TITLE = "Afterstep: a daily puzzle where your past self holds the doors";
async function routes(browser, name, viewport) {
  const page = await newPage(browser, { viewport });
  page.on("console", (m) => m.type() === "error" && fail(`${name}: console error: ${m.text()}`));
  page.on("pageerror", (e) => fail(`${name}: page error: ${e.message}`));
  const origin = new URL(base).origin;
  const dates = readdirSync(join(repo, "levels/daily")).map((f) => f.replace(".json", "")).filter((d) => d < today).sort();
  const pastDate = dates[dates.length - 1];
  if (!pastDate) return fail(`${name}: no puzzle before today to test with`);
  const past = JSON.parse(readFileSync(join(repo, "levels/daily", `${pastDate}.json`), "utf8"));
  const [, pm, pd] = pastDate.split("-").map(Number);
  const pastTitle = `Afterstep · ${pd} ${MONTHS[pm - 1]}`;

  // Where the page is: its URL (without the origin), title, history length and screen.
  const where = () => page.evaluate(() => ({
    url: location.href.slice(location.origin.length),
    title: document.title,
    length: history.length,
    screen: document.querySelector<HTMLElement>(".play").hidden ? (document.querySelector<HTMLElement>("#archive").hidden ? "none" : "past") : document.querySelector<HTMLElement>("#level-title").textContent,
    sub: document.querySelector<HTMLElement>("#level-sub").textContent,
    dialog: !!document.querySelector<HTMLElement>("dialog[open]"),
  }));
  const settle = (screen) => page.waitForFunction((screen) => {
    const play = !document.querySelector<HTMLElement>(".play").hidden;
    return screen === "past" ? !play && !document.querySelector<HTMLElement>("#archive").hidden : play && document.querySelector<HTMLElement>("#level-title").textContent === screen;
  }, screen, { timeout: 3000 }).catch(() => {});
  async function expectAt(label, want) {
    if (!page.url().startsWith(origin)) return fail(`${name}: ${label}: left the site for ${page.url()}`);
    await settle(want.screen);
    const got = await where();
    for (const k of Object.keys(want)) if (got[k] !== want[k]) fail(`${name}: ${label}: ${k} should be ${JSON.stringify(want[k])}, is ${JSON.stringify(got[k])}`);
    return got;
  }

  // A newcomer's bare URL is the first lesson, with the URL replaced, not added to.
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForSelector(".cell", { timeout: 8000 });
  const start = await where();
  const first = await expectAt("newcomer's first visit", { url: "/#/learn/1", title: "Afterstep · Lesson 1", screen: "Plates open doors" });
  const n0 = first.length;

  const lessonTitle = await page.textContent("#level-title");
  const todayTitle = `Puzzle ${level.id}`, pastScreen = `Puzzle ${past.id}`;
  await page.click('[data-nav="today"]');
  await expectAt("Today", { url: "/", title: HOME_TITLE, screen: todayTitle, length: n0 + 1 });
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");
  await expectAt("two moves on today's puzzle", { url: "/", length: n0 + 1 });

  await page.click('[data-nav="archive"]');
  await expectAt("Past puzzles", { url: "/#/past", title: "Afterstep · Past puzzles", screen: "past", length: n0 + 2 });
  await page.locator(`#archive-list a[href="#/puzzle/${pastDate}"]`).click();
  await expectAt("a past puzzle", { url: `/#/puzzle/${pastDate}`, title: pastTitle, screen: pastScreen, length: n0 + 3 });
  await page.keyboard.press("ArrowDown");
  await expectAt("a move on a past puzzle", { url: `/#/puzzle/${pastDate}`, length: n0 + 3 });

  await page.click('[data-nav="learn"]');
  await expectAt("How to play", { url: "/#/learn/1", title: "Afterstep · Lesson 1", screen: lessonTitle, length: n0 + 4 });
  await play(page, "RRRRR");
  if (!(await dialogOpens(page))) fail(`${name}: lesson 1 not solved by RRRRR`);
  await page.click("#next");
  const lesson2 = await expectAt("lesson 2 by Next", { url: "/#/learn/2", title: "Afterstep · Lesson 2", sub: "Lesson 2 of 5", length: n0 + 5 });
  await page.screenshot({ path: join(out, `${name}-lesson2.png`) });

  // Reload keeps lesson 2 (not lesson 1) and adds nothing.
  await page.reload({ waitUntil: "networkidle" });
  await expectAt("lesson 2 reloaded", { url: "/#/learn/2", title: "Afterstep · Lesson 2", screen: lesson2.screen, sub: "Lesson 2 of 5", length: n0 + 5 });

  // Back walks every screen, without leaving the site.
  await page.goBack();
  await expectAt("Back to lesson 1", { url: "/#/learn/1", title: "Afterstep · Lesson 1", screen: lessonTitle });
  await page.goBack();
  await expectAt("Back to the past puzzle", { url: `/#/puzzle/${pastDate}`, title: pastTitle, screen: pastScreen });
  await page.goBack();
  await expectAt("Back to Past puzzles", { url: "/#/past", title: "Afterstep · Past puzzles", screen: "past" });
  await expectPastFocus(page, name, "Back to Past puzzles from a past puzzle", pastDate);
  await page.goBack();
  await expectAt("Back to today", { url: "/", title: HOME_TITLE, screen: todayTitle });
  await page.goBack();
  await expectAt("Back to the first lesson", { url: "/#/learn/1", screen: lessonTitle });

  // Forward walks them again.
  await page.goForward();
  await expectAt("Forward to today", { url: "/", title: HOME_TITLE, screen: todayTitle });
  await page.goForward();
  await expectAt("Forward to Past puzzles", { url: "/#/past", screen: "past" });
  await page.goForward();
  await expectAt("Forward to the past puzzle", { url: `/#/puzzle/${pastDate}`, title: pastTitle, screen: pastScreen });
  const navCurrent = await page.evaluate(() => document.querySelector<HTMLElement>("[data-nav][aria-current]")?.dataset.nav);
  if (navCurrent !== "archive") fail(`${name}: a past puzzle should mark Past puzzles in the nav, marks ${navCurrent}`);

  // Reload keeps the past puzzle; its result links to it.
  await page.reload({ waitUntil: "networkidle" });
  await expectAt("past puzzle reloaded", { url: `/#/puzzle/${pastDate}`, title: pastTitle, screen: pastScreen, length: n0 + 5 });
  await play(page, past.solution);
  if (!(await dialogOpens(page))) fail(`${name}: the past puzzle (${pastDate}) not solved by its solution`);
  else {
    await stubClipboard(page);
    await page.click("#share");
    const copied = await page.evaluate(() => window.__copied);
    const link = `https://afterstep.brightloopapps.com/#/puzzle/${pastDate}`;
    if (copied.split("\n")[1] !== link) fail(`${name}: a past puzzle's result should link to ${link}, got "${copied.split("\n")[1]}"`);
    // Back with the win dialog open closes it and goes back.
    await page.goBack();
    await expectAt("Back with the win dialog open", { url: "/#/past", screen: "past", dialog: false });
    await expectPastFocus(page, name, "Back to Past puzzles with the win dialog open", pastDate);
    await page.goForward();
    await expectAt("Forward to the solved past puzzle", { url: `/#/puzzle/${pastDate}`, screen: pastScreen, dialog: false });
    await expectSolved(page, name, "past puzzle opened by Forward", `Solved in ${past.par} moves, par ${past.par}`, "Past puzzles");
    if ((await page.evaluate(() => document.activeElement.id)) !== "board") fail(`${name}: a puzzle opened by Forward should focus the board`);
  }
  console.log(`${name}: newcomer at ${start.url}, then today, Past puzzles, ${pastDate}, lessons 1-2: Back, Forward and reload walk them`);
  await page.close();

  // Bad links open today's puzzle with the URL replaced (newcomers included), with no console error.
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tomorrow = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  const bad = [`#/puzzle/${tomorrow}`, "#/puzzle/2099-01-01", "#/puzzle/2001-01-01", "#/puzzle/2026-02-30", "#/puzzle/nov-10", "#/nope", "#/learn/9"];
  const fresh = await newPage(browser, { viewport });
  await fresh.goto(new URL("/#/past", base).href, { waitUntil: "networkidle" });
  const freshLength = await fresh.evaluate(() => history.length);
  await fresh.close();
  for (const hash of bad) {
    const label = `${name}: link ${hash}`;
    const p = await newPage(browser, { viewport });
    p.on("console", (m) => m.type() === "error" && fail(`${label}: console error: ${m.text()}`));
    p.on("pageerror", (e) => fail(`${label}: page error: ${e.message}`));
    await p.goto(new URL("/" + hash, base).href, { waitUntil: "networkidle" });
    await p.waitForFunction((s) => !document.querySelector<HTMLElement>(".play").hidden && document.querySelector<HTMLElement>("#level-title").textContent === s, todayTitle, { timeout: 3000 }).catch(() => {});
    const got = await p.evaluate(() => ({ url: location.href.slice(location.origin.length), title: document.title, screen: document.querySelector<HTMLElement>("#level-title").textContent, length: history.length }));
    const want = { url: "/", title: HOME_TITLE, screen: todayTitle, length: freshLength };
    if (JSON.stringify(got) !== JSON.stringify(want)) fail(`${label}: should open today's puzzle at the bare URL with nothing added to history, got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
    // The same link followed in place (a hash change) also lands on today, replacing itself.
    if (hash === bad[0]) {
      await p.click('[data-nav="archive"]');
      const before = await p.evaluate(() => history.length);
      await p.evaluate((h) => { location.hash = h; }, hash);
      await p.waitForFunction((s) => !document.querySelector<HTMLElement>(".play").hidden && document.querySelector<HTMLElement>("#level-title").textContent === s, todayTitle, { timeout: 3000 }).catch(() => {});
      const after = await p.evaluate(() => ({ url: location.href.slice(location.origin.length), length: history.length }));
      if (after.url !== "/" || after.length !== before + 1) fail(`${label}: typed in place, should land on today at "/" (one entry for the typed link), got ${JSON.stringify(after)} from ${before}`);
    }
    await p.close();
  }
  console.log(`${name}: ${bad.length} bad links open today's puzzle at "/" with the URL replaced`);
}

// Where focus is on Past puzzles: the entry for `date`, or the heading when `date` is null (lab#41).
async function expectPastFocus(page, name, label, date) {
  const got = await page.evaluate(() => {
    const a = document.activeElement;
    return a?.id === "archive-title" ? "heading" : a?.closest("#archive-list") ? a.getAttribute("href") : a ? `${a.tagName.toLowerCase()}#${a.id}` : "none";
  });
  const want = date ? `#/puzzle/${date}` : "heading";
  if (got !== want) fail(`${name}: ${label}: focus should be on ${date ? `the entry ${want}` : "the list heading"}, is on ${got}`);
}

// ── Past puzzles links (lab#41) ────────────────────────────────────────────
// Each entry is a real link that looks as the buttons did; a plain click is one
// history entry, other clicks are the browser's (new tab); today's puzzle has
// one address; Back to Past puzzles puts focus on the list.
async function pastLinks(browser, name, viewport) {
  // A whole context with the like API mocked, so tabs the links open never ask the live one.
  const ctx = await browser.newContext({ viewport });
  await mockLikes(ctx);
  ctx.on("page", (p) => {
    guard(p);
    p.on("console", (m) => m.type() === "error" && fail(`${name}: console error: ${m.text()}`));
    p.on("pageerror", (e) => fail(`${name}: page error: ${e.message}`));
  });
  const page = await ctx.newPage();
  const todayTitle = `Puzzle ${level.id}`;
  const dates = readdirSync(join(repo, "levels/daily")).map((f) => f.replace(".json", "")).filter((d) => d <= today).sort().reverse();
  const pastDate = dates.find((d) => d < today);
  if (!pastDate) return fail(`${name}: no puzzle before today to test with`);
  const pastTitle = `Puzzle ${JSON.parse(readFileSync(join(repo, "levels/daily", `${pastDate}.json`), "utf8")).id}`;
  const where = () => page.evaluate(() => ({
    url: location.href.slice(location.origin.length),
    title: document.title,
    length: history.length,
    screen: !document.querySelector<HTMLElement>(".play").hidden ? document.querySelector("#level-title").textContent : document.querySelector<HTMLElement>("#archive").hidden ? "none" : "past",
    nav: document.querySelector<HTMLElement>("[data-nav][aria-current]")?.dataset.nav ?? null,
  }));
  const settle = (screen) => page.waitForFunction((screen) => {
    const play = !document.querySelector<HTMLElement>(".play").hidden;
    return screen === "past" ? !play && !document.querySelector<HTMLElement>("#archive").hidden : play && document.querySelector("#level-title").textContent === screen;
  }, screen, { timeout: 3000 }).catch(() => {});
  async function expectAt(label, want) {
    await settle(want.screen);
    const got = await where();
    for (const k of Object.keys(want)) if (got[k] !== want[k]) fail(`${name}: ${label}: ${k} should be ${JSON.stringify(want[k])}, is ${JSON.stringify(got[k])}`);
  }
  const atToday = { url: "/", title: HOME_TITLE, screen: todayTitle, nav: "today" };

  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForSelector(".cell", { timeout: 8000 });
  await page.click('[data-nav="today"]');
  await settle(todayTitle);
  await page.click('[data-nav="archive"]');
  await page.waitForSelector("#archive:not([hidden])");

  // Every entry is a link to its puzzle, and nothing in the list is a button.
  const list = await page.evaluate(() => ({
    hrefs: [...document.querySelectorAll("#archive-list > li > *")].map((e) => (e.tagName === "A" ? e.getAttribute("href") : e.tagName)),
    buttons: document.querySelectorAll("#archive-list button").length,
    abs: document.querySelector<HTMLAnchorElement>("#archive-list a")?.href,
  }));
  const wantHrefs = dates.map((d) => `#/puzzle/${d}`);
  if (JSON.stringify(list.hrefs) !== JSON.stringify(wantHrefs) || list.buttons) fail(`${name}: entries should be links ${JSON.stringify(wantHrefs)}, are ${JSON.stringify(list.hrefs)} (${list.buttons} buttons)`);
  const absWant = new URL(`/#/puzzle/${dates[0]}`, base).href;
  if (list.abs !== absWant) fail(`${name}: a copied entry link should be ${absWant}, is ${list.abs}`);

  // They look as the buttons did: a full-width bordered row in the text colour,
  // no underline, the hand cursor, the border darkening on hover and the focus
  // ring by keyboard.
  const link = page.locator(`#archive-list a[href="#/puzzle/${pastDate}"]`);
  const look = () => link.evaluate((a) => {
    const c = getComputedStyle(a);
    return { display: c.display, border: `${c.borderTopWidth} ${c.borderTopStyle}`, radius: c.borderTopLeftRadius, underline: c.textDecorationLine, cursor: c.cursor,
      borderColor: c.borderTopColor, outline: `${c.outlineWidth} ${c.outlineStyle}`, color: c.color, bodyColor: getComputedStyle(document.body).color,
      width: a.getBoundingClientRect().width, li: a.parentElement.getBoundingClientRect().width };
  });
  // Buttons' 1.5px border and 2.5px ring, as this screen rounds them (a nav button's).
  const buttonBorder = await page.evaluate(() => `${getComputedStyle(document.querySelector("[data-nav]")).borderTopWidth} solid`);
  await page.mouse.move(0, 0);
  const rest = await look();
  if (rest.display !== "flex" || rest.border !== buttonBorder || rest.radius !== "10px" || rest.underline !== "none" || rest.cursor !== "pointer" || rest.color !== rest.bodyColor || Math.abs(rest.width - rest.li) > 0.5)
    fail(`${name}: an entry should look like the old button row (border ${buttonBorder}), got ${JSON.stringify(rest)}`);
  await link.hover();
  const hover = await look();
  if (hover.borderColor === rest.borderColor) fail(`${name}: an entry's border should darken on hover (${rest.borderColor})`);
  await page.mouse.move(0, 0);
  await page.locator('[data-nav="archive"]').focus();
  for (let i = 0; i < 8 && !(await link.evaluate((a) => a === document.activeElement)); i++) await page.keyboard.press("Tab");
  const ring = await look();
  await page.locator('[data-nav="archive"]').focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  const navRing = await page.evaluate(() => { const c = getComputedStyle(document.activeElement); return `${c.outlineWidth} ${c.outlineStyle}`; });
  if (ring.outline !== navRing || !ring.outline.endsWith("solid")) fail(`${name}: a keyboard-focused entry should show the buttons' focus ring (${navRing}), got ${ring.outline}`);
  await page.screenshot({ path: join(out, `${name}-past-puzzles.png`) });

  // Middle click and Cmd/Ctrl click open the puzzle in a new tab, and leave this one as it is.
  const before = await where();
  for (const how of [{ button: "middle" }, { modifiers: ["ControlOrMeta"] }]) {
    const label = how.button ? "middle click" : "Cmd/Ctrl click";
    const [tab] = await Promise.all([ctx.waitForEvent("page", { timeout: 4000 }).catch(() => null), link.click(how)]);
    if (!tab) { fail(`${name}: a ${label} on an entry should open a new tab`); continue; }
    await tab.waitForLoadState("networkidle");
    await tab.waitForFunction((t) => !document.querySelector<HTMLElement>(".play").hidden && document.querySelector("#level-title").textContent === t, pastTitle, { timeout: 4000 }).catch(() => {});
    const opened = await tab.evaluate(() => ({ url: location.href.slice(location.origin.length), screen: document.querySelector("#level-title").textContent }));
    if (opened.url !== `/#/puzzle/${pastDate}` || opened.screen !== pastTitle) fail(`${name}: a ${label} should open ${pastTitle} at /#/puzzle/${pastDate} in the new tab, opened ${JSON.stringify(opened)}`);
    await tab.close();
    const after = await where();
    if (JSON.stringify(after) !== JSON.stringify(before)) fail(`${name}: a ${label} should leave this tab on Past puzzles, got ${JSON.stringify(after)} from ${JSON.stringify(before)}`);
  }

  // Today's entry: a plain click is one history entry, at the bare URL, with the home title and Today marked.
  await page.locator(`#archive-list a[href="#/puzzle/${today}"]`).click();
  await expectAt("today's entry", { ...atToday, length: before.length + 1 });
  // Back to the list: focus on today's entry.
  await page.goBack();
  await expectAt("Back from today's puzzle", { url: "/#/past", screen: "past", nav: "archive" });
  await expectPastFocus(page, name, "Back to Past puzzles from today's puzzle", today);
  // A past entry by keyboard (Enter), then Back: focus on that entry.
  await link.focus();
  await page.keyboard.press("Enter");
  await expectAt("a past entry by Enter", { url: `/#/puzzle/${pastDate}`, screen: pastTitle, nav: "archive", length: before.length + 1 });
  await page.goBack();
  await expectAt("Back from a past puzzle", { url: "/#/past", screen: "past" });
  await expectPastFocus(page, name, "Back to Past puzzles after Enter", pastDate);
  // From a lesson there's no entry to return to: focus goes to the heading.
  await page.click('[data-nav="learn"]');
  await settle("Plates open doors");
  await page.goBack();
  await expectAt("Back from a lesson", { url: "/#/past", screen: "past" });
  await expectPastFocus(page, name, "Back to Past puzzles from a lesson", null);
  // Past puzzles by the nav leaves focus on the nav.
  await page.click('[data-nav="archive"]');
  await settle("past");
  if ((await page.evaluate(() => (document.activeElement as HTMLElement)?.dataset.nav)) !== "archive") fail(`${name}: Past puzzles by the nav should leave focus on the nav`);

  // #/puzzle/<today> typed in place is today too, replacing itself (Back is Past puzzles).
  await page.evaluate((h) => { location.hash = h; }, `#/puzzle/${today}`);
  await expectAt(`#/puzzle/${today} typed in place`, atToday);
  await page.goBack();
  await expectAt(`Back from #/puzzle/${today} typed in place`, { url: "/#/past", screen: "past" });

  // Opened directly by a returning player: today's puzzle, the URL replaced.
  const direct = await ctx.newPage();
  const blank = await direct.evaluate(() => history.length);
  await direct.goto(new URL(`/#/puzzle/${today}`, base).href, { waitUntil: "networkidle" });
  await direct.waitForFunction((t) => !document.querySelector<HTMLElement>(".play").hidden && document.querySelector("#level-title").textContent === t, todayTitle, { timeout: 3000 }).catch(() => {});
  const got = await direct.evaluate(() => ({ url: location.href.slice(location.origin.length), title: document.title, screen: document.querySelector("#level-title").textContent, nav: document.querySelector<HTMLElement>("[data-nav][aria-current]")?.dataset.nav, length: history.length }));
  const wantDirect = { ...atToday, length: blank + 1 };
  if (JSON.stringify(got) !== JSON.stringify(wantDirect)) fail(`${name}: #/puzzle/${today} opened directly should be ${JSON.stringify(wantDirect)}, got ${JSON.stringify(got)}`);
  await ctx.close();

  // Opened by a newcomer: the first lesson, as the bare URL gives them.
  const newcomer = await newPage(browser, { viewport });
  newcomer.on("console", (m) => m.type() === "error" && fail(`${name}: newcomer: console error: ${m.text()}`));
  newcomer.on("pageerror", (e) => fail(`${name}: newcomer: page error: ${e.message}`));
  await newcomer.goto(new URL(`/#/puzzle/${today}`, base).href, { waitUntil: "networkidle" });
  await newcomer.waitForFunction(() => !document.querySelector<HTMLElement>(".play").hidden && document.querySelector<HTMLElement>("#level-sub").textContent === "Lesson 1 of 5", null, { timeout: 3000 }).catch(() => {});
  const fresh = await newcomer.evaluate(() => ({ url: location.href.slice(location.origin.length), title: document.title, sub: document.querySelector<HTMLElement>("#level-sub").textContent }));
  const wantFresh = { url: "/#/learn/1", title: "Afterstep · Lesson 1", sub: "Lesson 1 of 5" };
  if (JSON.stringify(fresh) !== JSON.stringify(wantFresh)) fail(`${name}: a newcomer opening #/puzzle/${today} should get the first lesson like the bare URL, ${JSON.stringify(wantFresh)}, got ${JSON.stringify(fresh)}`);
  await newcomer.close();
  console.log(`${name}: entries are links; middle and Cmd/Ctrl click open new tabs; #/puzzle/${today} is "/"; Back focuses the entry or the heading`);
}

// ── Level loading (lab#40) ─────────────────────────────────────────────────
// A daily's request blocked (offline), refused (404) or answered with something
// that isn't a level shows a short message with Retry, read out politely, with
// focus on Retry, no page error (an unhandled rejection is one) and no console
// error but the browser's own line for each request blocked or refused here;
// Back and Forward still work, and Retry loads the puzzle once the network is
// back. Afterstep's own index not loading does the same. While a puzzle is on its
// way (a delayed request), game keys, the d-pad, Undo, Start over and Hint leave
// the old board alone, also a solved one (nothing nudges); a slow load says so
// after a moment, and a quick one shows no message at all.
const LOAD_FAILED = "This puzzle didn't load. Check your connection and try again.";
async function levelLoad(browser, name, viewport) {
  const dates = readdirSync(join(repo, "levels/daily")).map((f) => f.replace(".json", "")).filter((d) => d < today).sort();
  const [solvedDate, pastDate] = dates.slice(-2);
  if (!pastDate) return fail(`${name}: need two puzzles before today to test with`);
  const past = JSON.parse(readFileSync(join(repo, "levels/daily", `${pastDate}.json`), "utf8"));
  const solvedPast = JSON.parse(readFileSync(join(repo, "levels/daily", `${solvedDate}.json`), "utf8"));

  const page = await newPage(browser, { viewport });
  // The browser's own line for a request blocked or refused below is expected,
  // once per such request; any other console error fails.
  let netLines = 0, netExpected = 0;
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    if (/^Failed to load resource: (net::ERR_INTERNET_DISCONNECTED|the server responded with a status of 404\b)/.test(m.text())) netLines++;
    else fail(`${name}: console error: ${m.text()}`);
  });
  page.on("pageerror", (e) => fail(`${name}: page error: ${e.message}`));
  await page.addInitScript((s) => location.protocol.startsWith("http") && !localStorage.getItem("afterstep:v1") && localStorage.setItem("afterstep:v1", s),
    JSON.stringify({ learned: true, results: { [solvedDate]: solvedPast.par } }));
  // Notes whenever the loading screen is visible, to catch one that only flashes.
  await page.addInitScript(() => {
    window.__loadSeen = false;
    const look = () => {
      const l = document.querySelector<HTMLElement>("#load");
      if (l && !l.hidden && l.offsetParent) window.__loadSeen = true;
      requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });
  await page.goto(base, { waitUntil: "networkidle" });
  if (!(await page.waitForSelector(".cell", { timeout: 8000 }).catch(() => null))) {
    fail(`${name}: board never rendered`);
    return page.close();
  }

  const state = () => page.evaluate(() => {
    const none = { hidden: true, getAttribute: () => null, textContent: "", offsetParent: null };
    const load = document.querySelector<HTMLElement>("#load") ?? none, retry = document.querySelector<HTMLElement>("#retry") ?? none;
    return {
      url: location.href.slice(location.origin.length),
      screen: !document.querySelector<HTMLElement>(".play").hidden ? document.querySelector<HTMLElement>("#level-title").textContent : !document.querySelector<HTMLElement>("#archive").hidden ? "past" : load.hidden ? "none" : "load",
      text: load.hidden ? null : document.querySelector<HTMLElement>("#load-text").textContent,
      retry: !load.hidden && !retry.hidden && !!retry.offsetParent,
      live: (document.querySelector<HTMLElement>("#load-live") ?? none).textContent,
      liveRole: (document.querySelector<HTMLElement>("#load-live") ?? none).getAttribute("role"),
      focus: document.activeElement.id,
      nav: document.querySelector<HTMLElement>("[data-nav][aria-current]")?.dataset.nav,
      moves: Number(document.querySelector<HTMLElement>("#moves").textContent.match(/Moves\s*(\d+)/)?.[1]),
      hint: !document.querySelector<HTMLElement>("#hint-note").hidden || !document.querySelector<HTMLElement>(".hint-mark").hidden,
      bumped: [...document.querySelectorAll<HTMLElement>(".player, .echo, #solved")].filter((e) => e.classList.contains("bump")).map((e) => e.id || e.className),
      solved: document.querySelector<HTMLElement>("#solved-text").textContent,
    };
  });
  const failedNow = (want) => page.waitForFunction((want) => {
    const l = document.querySelector<HTMLElement>("#load");
    return l && !l.hidden && !document.querySelector<HTMLElement>("#retry").hidden && document.querySelector<HTMLElement>("#load-text").textContent === want;
  }, want, { timeout: 3000 }).then(() => true, () => false);
  // Focus that was on the screen the message replaces moves to Retry; focus on
  // the nav stays there, and Tab goes on to Retry.
  async function expectFailed(label, want = LOAD_FAILED) {
    if (!(await failedNow(want))) {
      fail(`${name}: ${label}: should say "${want}" with Retry, got ${JSON.stringify(await state())}`);
      return null;
    }
    const s = await state();
    if (s.live !== want || s.liveRole !== "status") fail(`${name}: ${label}: the message should be read out politely (live "${s.live}", role ${s.liveRole})`);
    const onNav = await page.evaluate(() => !!document.activeElement.closest("nav"));
    if (onNav) {
      for (let i = 0; i < 4 && (await page.evaluate(() => document.activeElement.closest("nav"))); i++) await page.keyboard.press("Tab");
      const next = await page.evaluate(() => document.activeElement.id);
      if (next !== "retry") fail(`${name}: ${label}: Tab from the nav should reach Retry next, reached "${next}"`);
    } else if (s.focus !== "retry") fail(`${name}: ${label}: focus should be on Retry, is on "${s.focus}"`);
    return s;
  }
  const settle = (title) => page.waitForFunction((t) => !document.querySelector<HTMLElement>(".play").hidden && document.querySelector<HTMLElement>("#level-title").textContent === t && document.querySelector<HTMLElement>("#load")?.hidden !== false, title, { timeout: 4000 }).then(() => true, () => false);

  // Offline: Past puzzles, then a puzzle whose request can't go out.
  const daily = `**/levels/daily/${pastDate}.json`;
  let hits = 0;
  await page.route(daily, (r) => { hits++; netExpected++; return r.abort("internetdisconnected"); });
  await page.click('[data-nav="archive"]');
  await page.waitForSelector("#archive:not([hidden])");
  await page.locator("#archive-list a").filter({ hasText: new RegExp(`^Puzzle ${past.id}\\b`) }).click();
  let s = await expectFailed("offline");
  if (s && s.focus !== "retry") fail(`${name}: offline: a puzzle picked from Past puzzles should leave focus on Retry, is on "${s.focus}"`);
  if (s && (s.url !== `/#/puzzle/${pastDate}` || s.nav !== "archive")) fail(`${name}: offline: the URL and nav should name the puzzle asked for, got ${JSON.stringify(s)}`);
  await page.screenshot({ path: join(out, `${name}-failed.png`) });

  // Back and Forward still work.
  await page.goBack();
  if (!(await page.waitForFunction(() => !document.querySelector<HTMLElement>("#archive").hidden && document.querySelector<HTMLElement>("#load")?.hidden !== false, null, { timeout: 3000 }).catch(() => null)))
    fail(`${name}: Back from the message should show Past puzzles, got ${JSON.stringify(await state())}`);
  await page.goForward();
  await expectFailed("Forward to the puzzle, still offline");

  // Retry by keyboard: refused (404), then not a level, then the network is back.
  await page.unroute(daily);
  await page.route(daily, (r) => { hits++; netExpected++; return r.fulfill({ status: 404, contentType: "text/html", body: "<h1>Not found</h1>" }); });
  let before = hits;
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  if (hits !== before + 1) fail(`${name}: Retry should ask for the puzzle again (${hits - before} requests)`);
  await expectFailed("Retry, then a 404");
  await page.unroute(daily);
  await page.route(daily, (r) => { hits++; return r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Afterstep</title>" }); });
  before = hits;
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  if (hits !== before + 1) fail(`${name}: Retry should ask for the puzzle again (${hits - before} requests)`);
  await expectFailed("Retry, then a page that isn't a level");
  await page.unroute(daily);
  await page.keyboard.press("Enter");
  if (!(await settle(`Puzzle ${past.id}`))) fail(`${name}: Retry with the network back should open puzzle ${past.id}, got ${JSON.stringify(await state())}`);
  s = await state();
  if (s.focus !== "board" || s.moves !== 0 || s.text !== null) fail(`${name}: after Retry the puzzle should be on screen at move 0 with the board focused, got ${JSON.stringify(s)}`);

  // A quick load (300 ms) shows no message.
  const delay = (date, ms) => page.route(`**/levels/daily/${date}.json`, (r) => setTimeout(() => r.continue().catch(() => {}), ms));
  await delay(solvedDate, 300);
  await page.evaluate(() => { window.__loadSeen = false; });
  await page.evaluate((d) => { location.hash = `#/puzzle/${d}`; }, solvedDate);
  if (!(await settle(`Puzzle ${solvedPast.id}`))) fail(`${name}: a quick load should open puzzle ${solvedPast.id}`);
  if (await page.evaluate(() => window.__loadSeen)) fail(`${name}: a load of 300 ms should show no message`);
  await page.unroute(`**/levels/daily/${solvedDate}.json`);

  // Keys during a slow load (1.5 s): first from a solved board (nothing nudges),
  // then from one in play (nothing moves); the slow load says so after a moment.
  const solvedLine = (await state()).solved;
  if (!solvedLine.startsWith("Solved in")) fail(`${name}: puzzle ${solvedPast.id} should open solved from the save, says "${solvedLine}"`);
  for (const [from, to, toTitle] of [[solvedPast, pastDate, `Puzzle ${past.id}`], [past, today, `Puzzle ${level.id}`]]) {
    const label = from === solvedPast ? "keys on a solved board during a slow load" : "keys on a board in play during a slow load";
    if (from === past) {
      // Three moves, with the nudge taken on the way, so H would now mark a move.
      await play(page, past.solution.slice(0, 2));
      await page.keyboard.press("KeyH");
      await play(page, past.solution.slice(2, 3));
    }
    // Any nudge from here on is new.
    await page.evaluate(() => document.querySelectorAll<HTMLElement>(".bump").forEach((e) => e.classList.remove("bump")));
    const was = await state();
    await delay(to, 1500);
    const t0 = Date.now();
    await page.evaluate((d) => { location.hash = d === "" ? "#/" : `#/puzzle/${d}`; }, to === today ? "" : to);
    for (const k of ["ArrowRight", "ArrowDown", "Space", "KeyH", "KeyZ", "KeyR", "KeyU", "KeyH"]) await page.keyboard.press(k);
    await page.evaluate(() => document.querySelectorAll<HTMLElement>(".dpad button").forEach((b) => b.click()));
    for (const b of ["#wait", "#hint", "#undo", "#restart"]) await page.click(b);
    const during = await state();
    const quick = Date.now() - t0 < 550;
    if (during.screen !== was.screen || during.moves !== was.moves || during.hint || during.bumped.length || during.solved !== was.solved)
      fail(`${name}: ${label}: the old board should be left alone, was ${JSON.stringify(was)}, is ${JSON.stringify(during)}`);
    if (quick && during.text !== null) fail(`${name}: ${label}: no message in the first moment, got "${during.text}"`);
    if (!(await page.waitForFunction(() => document.querySelector<HTMLElement>("#load-text")?.textContent === "Loading the puzzle…" && !document.querySelector<HTMLElement>("#load").hidden, null, { timeout: 1300 }).catch(() => null)))
      fail(`${name}: ${label}: a slow load should say so after a moment, got ${JSON.stringify(await state())}`);
    else if (from === past) await page.screenshot({ path: join(out, `${name}-loading.png`) });
    if (!(await settle(toTitle))) fail(`${name}: ${label}: ${toTitle} should open once it loads`);
    const after = await state();
    if (after.moves !== 0 || after.hint || after.focus !== "board") fail(`${name}: ${label}: the new puzzle should start at move 0, no hint, board focused, got ${JSON.stringify(after)}`);
    await page.unroute(`**/levels/daily/${to}.json`);
  }
  if (netLines > netExpected || netLines === 0) fail(`${name}: expected the browser's network line for each of the ${netExpected} blocked or refused requests, got ${netLines}`);
  console.log(`${name}: offline, 404 and not-a-level show the message with Retry; Back works; Retry loads; keys during a slow load leave the old board alone (${netLines} expected network lines)`);
  await page.close();

  // Afterstep's own index blocked (a touch phone): the same message, then Retry.
  const phone = await newPage(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  let phoneLines = 0, phoneExpected = 0;
  phone.on("console", (m) => {
    if (m.type() !== "error") return;
    if (/^Failed to load resource: net::ERR_INTERNET_DISCONNECTED/.test(m.text())) phoneLines++;
    else fail(`${name} phone: console error: ${m.text()}`);
  });
  phone.on("pageerror", (e) => fail(`${name} phone: page error: ${e.message}`));
  await phone.route("**/levels/index.json", (r) => { phoneExpected++; return r.abort("internetdisconnected"); });
  await phone.goto(base, { waitUntil: "load" });
  const BOOT_FAILED = "Afterstep didn't load. Check your connection and try again.";
  const bootFailed = await phone.waitForFunction((t) => document.querySelector<HTMLElement>("#load")?.hidden === false && document.querySelector<HTMLElement>("#load-text").textContent === t && !document.querySelector<HTMLElement>("#retry").hidden, BOOT_FAILED, { timeout: 4000 }).then(() => true, () => false);
  if (!bootFailed) fail(`${name} phone: a blocked index should say "${BOOT_FAILED}" with Retry`);
  else {
    const box = await phone.locator("#retry").boundingBox();
    if (!box || box.height < 44) fail(`${name} phone: Retry should be at least 44px tall, is ${box?.height}`);
    await phone.screenshot({ path: join(out, `${name}-phone-failed.png`) });
    await phone.unroute("**/levels/index.json");
    await phone.tap("#retry");
    if (!(await phone.waitForFunction(() => !document.querySelector<HTMLElement>(".play").hidden && document.querySelector<HTMLElement>(".cell") && document.querySelector<HTMLElement>("#load")?.hidden !== false, null, { timeout: 4000 }).catch(() => null)))
      fail(`${name} phone: Retry should load Afterstep once the network is back`);
    else if ((await phone.textContent("#level-title")) !== "Plates open doors") fail(`${name} phone: after Retry a newcomer should get the first lesson`);
  }
  if (phoneLines > phoneExpected || phoneLines === 0) fail(`${name} phone: expected the browser's network line for the blocked index, got ${phoneLines} of ${phoneExpected}`);
  await phone.close();
}

const browser = await chromium.launch({ executablePath: browserPath });
try {
  await routes(browser, "routes", { width: 1280, height: 900 });
  await pastLinks(browser, "past-links", { width: 1280, height: 900 });
  await levelLoad(browser, "level-load", { width: 1280, height: 900 });
  await likesFlow(browser);
  await likeTabs(browser);
  await keyboardStart(browser, "desktop-dark", { width: 1280, height: 900 });
  await keysHint(browser, "keys-hint");
  await session(browser, "desktop-dark", { width: 1280, height: 900 }, "dark");
  await session(browser, "phone-light", { width: 390, height: 844 }, "light");
  await touchControls(browser, "phone-touch", { width: 390, height: 844 });
  await hintFlow(browser, "desktop-hints", { width: 1280, height: 900 });
  await oldSave(browser, "old-save", { width: 390, height: 844 });
  await lessons(browser, "desktop-lessons-dark", { width: 1280, height: 900 }, "dark", false);
  await lessons(browser, "phone-lessons-light", { width: 390, height: 844 }, "light", true);
  await lessons(browser, "phone-360-lessons-dark", { width: 360, height: 640 }, "dark", true);
  await lessons(browser, "phone-700-lessons-light", { width: 390, height: 700 }, "light", true);
  for (const [w, h] of [[360, 640], [390, 700], [390, 844], [320, 568], [844, 390], [667, 375]])
    await fitScreens(browser, `fit-${w}x${h}`, { width: w, height: h }, w > h ? "dark" : "light");
} finally {
  await browser.close();
}

if (failures.length) {
  console.error("PLAYTEST FAIL\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log(`PLAYTEST PASS (screenshots in ${out})`);
