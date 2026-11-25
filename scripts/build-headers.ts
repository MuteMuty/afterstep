// After `vite build`: write web/dist/_headers, keeping each content-hashed file in
// web/dist/assets for a year (rules in scripts/headers.ts, lab#62).
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { headersFile } from "./headers.ts";

const web = new URL("../web", import.meta.url).pathname;
if (existsSync(join(web, "public/_headers"))) throw new Error("web/public/_headers would be overwritten: add rules in scripts/headers.ts instead");
const assets = readdirSync(join(web, "dist/assets"));
writeFileSync(join(web, "dist/_headers"), headersFile(assets));
console.log(`headers: ${assets.length} files in /assets/ kept for a year`);
