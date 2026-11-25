// Check a deployed Afterstep's Cache-Control headers (lab#62), with GET and HEAD requests only.
// Run: node scripts/check-headers.ts https://afterstep.brightloopapps.com
import { checkSite } from "./headers.ts";

const base = process.argv[2];
if (!base) {
  console.error("usage: node scripts/check-headers.ts <url>");
  process.exit(2);
}
const problems = await checkSite(base);
for (const p of problems) console.error(`FAIL ${p}`);
console.log(problems.length ? `headers: ${problems.length} problem(s) at ${base}` : `headers: OK at ${base}`);
process.exit(problems.length ? 1 : 0);
