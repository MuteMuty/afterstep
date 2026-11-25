// Cache rules for Workers Static Assets (lab#62).
//
// Cloudflare sends "public, max-age=0, must-revalidate" for every file without a rule, so the
// page and /levels/* are checked on every visit and a new daily puzzle shows the same day.
// Vite names each file in /assets/ (the font included) after a hash of its content, so those
// can be kept for a year: a changed file gets a new name. The rules list each built file by
// its exact path rather than "/assets/*", because a name that isn't in the build is answered
// with the page itself (single-page fallback), and that must never be kept.

export const IMMUTABLE = "public, max-age=31536000, immutable";

/** Cloudflare reads at most this many rules from _headers. */
const MAX_RULES = 100;

/** Vite's default asset name, `[name]-[hash].[ext]`: an 8-character hash before the extension. */
export const isHashed = (file: string) => /^[^/]+-[\w-]{8}\.\w+$/.test(file);

/** The _headers file for a build whose /assets/ holds `assets` (file names). */
export function headersFile(assets: string[]): string {
  const hashed = assets.filter(isHashed).sort();
  if (hashed.length > MAX_RULES) throw new Error(`${hashed.length} hashed assets, but Cloudflare reads at most ${MAX_RULES} _headers rules`);
  const head = "# Written by scripts/build-headers.ts (lab#62). Files without a rule revalidate on every visit.\n";
  return head + hashed.map((f) => `/assets/${f}\n  Cache-Control: ${IMMUTABLE}\n`).join("");
}

export type Rule = { path: string; headers: [name: string, value: string][] };

/** Parse a _headers file: a path line, then indented `Name: value` lines. */
export function parseHeaders(text: string): Rule[] {
  const rules: Rule[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      rules.push({ path: line.trim(), headers: [] });
      continue;
    }
    const rule = rules.at(-1);
    if (!rule) throw new Error(`header line before any path: ${line}`);
    const at = line.indexOf(":");
    rule.headers.push([line.slice(0, at).trim().toLowerCase(), line.slice(at + 1).trim()]);
  }
  return rules;
}

/** The headers the rules add to `path`: `*` matches anything, `:name` one segment; repeats join with ", ". */
export function headersFor(rules: Rule[], path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rule of rules) {
    const pattern = rule.path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/:[A-Za-z]\w*/g, "[^/]+");
    if (!new RegExp(`^${pattern}$`).test(path)) continue;
    for (const [name, value] of rule.headers) out[name] = out[name] ? `${out[name]}, ${value}` : value;
  }
  return out;
}

/** True when a browser checks the file on every visit and never keeps it. */
export const revalidates = (cc: string | null) =>
  !!cc && !/immutable/i.test(cc) && (/(^|[\s,])no-cache\b/i.test(cc) || /(^|[\s,])max-age=0\b/i.test(cc));

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** Check a deployed site's Cache-Control headers with GET and HEAD requests only. Returns the problems found. */
export async function checkSite(base: string, fetchFn: Fetch = fetch): Promise<string[]> {
  const problems: string[] = [];
  const url = (path: string) => new URL(path, base).href;
  const get = async (path: string, method = "GET") => {
    const res = await fetchFn(url(path), { method, redirect: "manual" });
    if (res.status !== 200) problems.push(`${path}: status ${res.status}, expected 200`);
    return { cc: res.headers.get("cache-control"), body: method === "HEAD" ? "" : await res.text() };
  };
  const mustRevalidate = (path: string, cc: string | null) => {
    if (!revalidates(cc)) problems.push(`${path}: Cache-Control is ${JSON.stringify(cc)}, but it should revalidate on every visit`);
  };
  const refs = (text: string) => [...new Set(text.match(/\/assets\/[\w.-]+/g) ?? [])];

  const home = await get("/");
  mustRevalidate("/", home.cc);
  const assets = refs(home.body);
  if (!assets.length) problems.push("/: the page links no /assets/ files");
  // The stylesheet names the font, and the script names the engine (wasm).
  for (const file of assets.filter((a) => /\.(css|js)$/.test(a))) assets.push(...refs((await get(file)).body).filter((a) => !assets.includes(a)));
  if (!assets.some((a) => a.endsWith(".woff2"))) problems.push("/: no font found in /assets/ (it should be one of Vite's hashed files)");
  for (const asset of assets) {
    const { cc } = await get(asset, "HEAD");
    if (!isHashed(asset.slice("/assets/".length))) problems.push(`${asset}: name has no content hash`);
    if (cc !== IMMUTABLE) problems.push(`${asset}: Cache-Control is ${JSON.stringify(cc)}, expected "${IMMUTABLE}"`);
  }

  const missing = "/assets/not-in-this-build-00000000.js";
  const fallback = await get(missing, "HEAD");
  if (/immutable/i.test(fallback.cc ?? "")) problems.push(`${missing} (a file that doesn't exist): Cache-Control is ${JSON.stringify(fallback.cc)}, so the page sent in its place would be kept`);

  const index = await get("/levels/index.json");
  mustRevalidate("/levels/index.json", index.cc);
  let latest: string | undefined;
  try {
    latest = (JSON.parse(index.body) as { daily: { date: string }[] }).daily.at(-1)?.date;
  } catch {
    problems.push("/levels/index.json: not the puzzle index");
  }
  if (latest) mustRevalidate(`/levels/daily/${latest}.json`, (await get(`/levels/daily/${latest}.json`)).cc);
  return problems;
}
