// Afterstep playtest: plays lessons 1-2 and today's puzzle (with the solver's
// solution) in a real browser, at desktop-dark and phone-light sizes, and
// checks the keyboard-first start (board focus, ring, Tab order, click-then-key)
// on desktop and tapping the controls on a touch phone. Hint check: the first
// hint on each puzzle is a nudge about its idea (no move marked, not counted);
// follows hints through lessons 1-3, gets stuck in lesson 4 and takes the
// offered undo, follows hints through lesson 5 (the echo bump), and checks the
// hint count on today's puzzle (and its absence on a past one). On the touch
// phone, today's nudge fits on one line. Lessons: all five are played in a row
// by keyboard (desktop, dark) and by tapping the d-pad (phone, light), checking
// "Lesson n of 5", where each win dialog leads, and that lesson 5 fits.
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
  await play(page, level.solution.slice(half));
  const won = await dialogOpens(page);
  if (!won) fail(`${name}: today's puzzle (${today}) not solved by its solution`);
  else {
    const body = await page.textContent("#win-body");
    if (!body.includes(`${level.par} moves`)) fail(`${name}: expected a ${level.par}-move win, got "${body}"`);
  }
  await page.screenshot({ path: join(out, `${name}-daily-won.png`) });
  if (won) await winKeys(page, name);
  console.log(`${name}: ${sub}`);
  await page.close();
}

// With the win dialog open, game keys must leave the board alone, and the
// copied result must use the winning move count. After Escape, Z and R work.
async function winKeys(page, name) {
  const moves = async () => Number((await page.textContent("#moves")).match(/Moves\s*(\d+)/)?.[1]);
  const won = await moves();
  for (const k of ["KeyR", "KeyZ", "Backspace", "Period", "ArrowLeft", "KeyD"]) await page.keyboard.press(k);
  await page.waitForTimeout(200);
  if ((await moves()) !== won) fail(`${name}: keys behind the win dialog changed moves from ${won} to ${await moves()}`);
  if (!(await page.isVisible("dialog[open]"))) fail(`${name}: win dialog closed after game keys`);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t) => { window.__copied = t; } } });
  });
  await page.click("#share");
  const copied = await page.evaluate(() => window.__copied ?? "");
  if (!copied.includes(`: ${level.par} moves (par ${level.par}) ★`))
    fail(`${name}: copied result should show the ${level.par}-move win, got "${copied.split("\n")[0]}"`);
  await page.keyboard.press("Escape");
  if (await page.isVisible("dialog[open]")) fail(`${name}: Escape should close the win dialog`);
  await page.keyboard.press("KeyZ");
  if ((await moves()) !== won - 1) fail(`${name}: Z after closing the dialog should undo (moves ${await moves()}, wanted ${won - 1})`);
  await page.keyboard.press("KeyR");
  if ((await moves()) !== 0) fail(`${name}: R after closing the dialog should restart (moves ${await moves()})`);
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
  await page.keyboard.press("KeyH");
  if ((await noteText()) !== "You can't win from here. Undo 3 moves?") fail(`${name}: lost position should offer "Undo 3 moves?", got "${await noteText()}"`);
  if (await page.isVisible("#board .hint-mark")) fail(`${name}: a lost position should not mark a move`);
  await page.screenshot({ path: join(out, `${name}-stuck.png`) });
  await page.click("#hint-note button");
  if ((await moves()) !== 7) fail(`${name}: the offered undo should go back to move 7, at ${await moves()}`);
  if ((await page.evaluate(() => document.activeElement.id)) !== "board") fail(`${name}: after the offered undo the board should have focus`);
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
    if (n === 5) await page.screenshot({ path: join(out, `${name}-lesson5-won.png`) });
    if (touch) await page.tap("#next");
    else await page.keyboard.press("Enter"); // the dialog's focused button is Copy result (hidden) or Next
  }
  await page.waitForFunction(() => document.querySelector("#level-title").textContent.startsWith("Puzzle "), null, { timeout: 4000 })
    .catch(() => fail(`${name}: "Play today's puzzle" after lesson 5 did not open today's puzzle`));
  await page.close();
}

const browser = await chromium.launch({ executablePath: browserPath });
try {
  await keyboardStart(browser, "desktop-dark", { width: 1280, height: 900 });
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
