// Afterstep playtest: plays lessons 1-2 and today's puzzle (with the solver's
// solution) in a real browser, at desktop-dark and phone-light sizes, and
// checks the keyboard-first start (board focus, ring, Tab order) on desktop.
//
// Usage: node tests/playtest.mjs <baseUrl>
// Env:   PLAYTEST_BROWSER  Chromium-based browser executable (default: Brave)
//        PLAYTEST_OUT      screenshot folder (default: ./playtest-out)
// Exit:  0 = pass, 1 = fail (reasons printed)
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
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
  await page.close();
}

const browser = await chromium.launch({ executablePath: browserPath });
try {
  await keyboardStart(browser, "desktop-dark", { width: 1280, height: 900 });
  await session(browser, "desktop-dark", { width: 1280, height: 900 }, "dark");
  await session(browser, "phone-light", { width: 390, height: 844 }, "light");
} finally {
  await browser.close();
}

if (failures.length) {
  console.error("PLAYTEST FAIL\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log(`PLAYTEST PASS (screenshots in ${out})`);
