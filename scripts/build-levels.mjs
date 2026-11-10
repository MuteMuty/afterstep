// Copy levels into the site, without solutions, and write an index of daily puzzles.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const out = join(root, "web/public/levels");
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "daily"), { recursive: true });
mkdirSync(join(out, "tutorial"), { recursive: true });

const strip = ({ solution, explored, needsEcho, ...rest }) => rest;
const daily = [];
for (const f of readdirSync(join(root, "levels/daily")).filter((f) => f.endsWith(".json")).sort()) {
  const lvl = JSON.parse(readFileSync(join(root, "levels/daily", f), "utf8"));
  lvl.par = lvl.par ?? lvl.solution?.length;
  writeFileSync(join(out, "daily", f), JSON.stringify(strip(lvl)));
  daily.push({ id: lvl.id, date: lvl.date, tier: lvl.tier, par: lvl.par });
}
const tutorial = [];
for (const f of readdirSync(join(root, "levels/tutorial")).filter((f) => f.endsWith(".json")).sort()) {
  tutorial.push(strip(JSON.parse(readFileSync(join(root, "levels/tutorial", f), "utf8"))));
}
writeFileSync(join(out, "index.json"), JSON.stringify({ daily, tutorial }));
console.log(`levels: ${daily.length} daily, ${tutorial.length} tutorial`);
