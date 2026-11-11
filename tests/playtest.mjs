// Afterstep playtest: plays lessons 1-2 and today's puzzle (with the solver's
// solution) in a real browser, at desktop-dark and phone-light sizes.
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
  if (!(await dialogOpens(page))) fail(`${name}: today's puzzle (${today}) not solved by its solution`);
  else {
    const body = await page.textContent("#win-body");
    if (!body.includes(`${level.par} moves`)) fail(`${name}: expected a ${level.par}-move win, got "${body}"`);
  }
  await page.screenshot({ path: join(out, `${name}-daily-won.png`) });
  console.log(`${name}: ${sub}`);
  await page.close();
}

const browser = await chromium.launch({ executablePath: browserPath });
try {
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
