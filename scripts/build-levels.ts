// Copy levels into the site, without solutions, and write an index of daily puzzles.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const out = join(root, "web/public/levels");
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "daily"), { recursive: true });
mkdirSync(join(out, "tutorial"), { recursive: true });

// A level file as the generator writes it; only these fields are read here.
type Level = { id: string; date?: string; tier?: string; par?: number; solution?: unknown[]; [field: string]: unknown };

const strip = ({ solution, explored, needsEcho, needsBump, ...rest }: Level) => rest;
const daily: Pick<Level, "id" | "date" | "tier" | "par">[] = [];
for (const f of readdirSync(join(root, "levels/daily")).filter((f) => f.endsWith(".json")).sort()) {
  const lvl: Level = JSON.parse(readFileSync(join(root, "levels/daily", f), "utf8"));
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
