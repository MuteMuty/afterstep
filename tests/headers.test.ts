// Unit tests for the cache rules (scripts/headers.ts, lab#62): the _headers file the build
// writes, and the check the director runs against the live site after a deploy. fetch is
// faked, so nothing goes over the network.
// Run: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { IMMUTABLE, isHashed, headersFile, parseHeaders, headersFor, revalidates, checkSite } from "../scripts/headers.ts";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const built = ["index-gSfhc6Gq.js", "index-Dwz8VIQt.css", "afterstep_engine_bg-DZy1Eqhv.wasm", "YoungSerif-latin-Ba2nuRz-.woff2"];

test("isHashed knows Vite's content-hashed names from plain ones", () => {
  for (const f of built) assert.ok(isHashed(f), f);
  for (const f of ["YoungSerif-latin.woff2", "index.js", "og.png", "afterstep_engine_bg.wasm", "index-gSfhc6G.js", "a/index-gSfhc6Gq.js"])
    assert.equal(isHashed(f), false, f);
});

test("each hashed file in /assets/ is kept for a year, and nothing else", () => {
  const rules = parseHeaders(headersFile([...built, "notes.txt"]));
  for (const f of built) assert.equal(headersFor(rules, `/assets/${f}`)["cache-control"], IMMUTABLE, f);
  // Not hashed, so it could change under the same name: Cloudflare's default (revalidate) applies.
  assert.equal(headersFor(rules, "/assets/notes.txt")["cache-control"], undefined);
  // A name that isn't in this build gets the page (single-page fallback), which must never be kept.
  assert.equal(headersFor(rules, "/assets/index-AAAAAAAA.js")["cache-control"], undefined);
  for (const path of ["/", "/index.html", "/archive", "/levels/index.json", "/levels/daily/2026-11-25.json", "/fonts/OFL.txt", "/og.png", "/favicon.svg"])
    assert.deepEqual(headersFor(rules, path), {}, path);
});

test("headersFile refuses more rules than Cloudflare reads", () => {
  const many = Array.from({ length: 101 }, (_, i) => `chunk${i}-${String(i).padStart(8, "0")}.js`);
  assert.throws(() => headersFile(many), /100/);
});

test("parseHeaders and headersFor follow Cloudflare's _headers rules", () => {
  const rules = parseHeaders(["# a comment", "/a/*", "  X-One: 1", "", "/a/:name/b", "\tX-Two: 2", "/a/*", "  X-One: 3"].join("\n"));
  assert.deepEqual(headersFor(rules, "/a/x/y"), { "x-one": "1, 3" });
  assert.deepEqual(headersFor(rules, "/a/x/b"), { "x-one": "1, 3", "x-two": "2" });
  assert.deepEqual(headersFor(rules, "/a"), {});
  assert.deepEqual(headersFor(rules, "/b/a/x"), {});
  assert.throws(() => parseHeaders("  X-One: 1"), /path/);
});

test("revalidates means checked on every visit and never kept", () => {
  for (const cc of ["public, max-age=0, must-revalidate", "no-cache", "max-age=0"]) assert.ok(revalidates(cc), cc);
  for (const cc of [null, "", IMMUTABLE, "public, max-age=3600", "max-age=0, immutable", "max-age=600"]) assert.equal(revalidates(cc), false, String(cc));
});

/** A fake site: `pages` maps a path to [Cache-Control, body]; anything else is the page itself (SPA fallback). */
function site(pages: Record<string, [string, string]>, fallback = "public, max-age=0, must-revalidate") {
  const seen: string[] = [];
  const fetchFn = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    seen.push(`${init?.method ?? "GET"} ${url.pathname}`);
    const [cc, body] = pages[url.pathname] ?? [fallback, "<!doctype html>"];
    return new Response(init?.method === "HEAD" ? null : body, { status: 200, headers: { "cache-control": cc } });
  };
  return { fetchFn, seen };
}

const page = `<script type="module" crossorigin src="/assets/index-gSfhc6Gq.js"></script><link rel="stylesheet" crossorigin href="/assets/index-Dwz8VIQt.css">`;
const css = `@font-face{src:url(/assets/YoungSerif-latin-Ba2nuRz-.woff2) format("woff2")}`;
const fixed: Record<string, [string, string]> = {
  "/": ["public, max-age=0, must-revalidate", page],
  "/assets/index-gSfhc6Gq.js": [IMMUTABLE, `e=new URL("/assets/afterstep_engine_bg-DZy1Eqhv.wasm",import.meta.url)`],
  "/assets/afterstep_engine_bg-DZy1Eqhv.wasm": [IMMUTABLE, ""],
  "/assets/index-Dwz8VIQt.css": [IMMUTABLE, css],
  "/assets/YoungSerif-latin-Ba2nuRz-.woff2": [IMMUTABLE, ""],
  "/levels/index.json": ["public, max-age=0, must-revalidate", JSON.stringify({ daily: [{ date: "2026-11-24" }, { date: "2026-11-25" }] })],
  "/levels/daily/2026-11-25.json": ["public, max-age=0, must-revalidate", "{}"],
};

test("checkSite passes a site with the rules in place, using only GET and HEAD", async () => {
  const { fetchFn, seen } = site(fixed);
  assert.deepEqual(await checkSite("https://example.test", fetchFn), []);
  assert.ok(seen.every((s) => /^(GET|HEAD) /.test(s)), seen.join("; "));
  for (const path of ["/", "HEAD /assets/YoungSerif-latin-Ba2nuRz-.woff2", "HEAD /assets/afterstep_engine_bg-DZy1Eqhv.wasm", "/levels/index.json", "/levels/daily/2026-11-25.json"])
    assert.ok(seen.some((s) => s === path || s.endsWith(` ${path}`)), path);
});

test("checkSite reports the site as it is before the fix", async () => {
  const before = Object.fromEntries(Object.entries(fixed).map(([p, [, body]]) => [p, ["public, max-age=0, must-revalidate", body]])) as typeof fixed;
  const problems = await checkSite("https://example.test/", site(before).fetchFn);
  for (const f of built) assert.ok(problems.some((p) => p.includes(`/assets/${f}`)), `${f} in ${problems.join("\n")}`);
});

test("checkSite reports a page or puzzle that would be kept, and a kept fallback", async () => {
  const kept = { ...fixed, "/": [IMMUTABLE, page] as [string, string], "/levels/daily/2026-11-25.json": ["public, max-age=86400", "{}"] as [string, string] };
  const problems = await checkSite("https://example.test", site(kept, IMMUTABLE).fetchFn);
  for (const path of ["/", "/levels/daily/2026-11-25.json"]) assert.ok(problems.some((p) => p.startsWith(`${path}: `)), `${path} in ${problems.join("\n")}`);
  assert.ok(problems.some((p) => /doesn't exist/.test(p)), problems.join("\n"));
});

test("checkSite reports a page with no hashed assets or no font", async () => {
  const bare = { ...fixed, "/": ["public, max-age=0, must-revalidate", "<p>hi</p>"] as [string, string] };
  assert.ok((await checkSite("https://example.test", site(bare).fetchFn)).some((p) => /no \/assets\//.test(p)));
  const noFont = { ...fixed, "/assets/index-Dwz8VIQt.css": [IMMUTABLE, "body{}"] as [string, string] };
  assert.ok((await checkSite("https://example.test", site(noFont).fetchFn)).some((p) => /font/.test(p)));
});

// After `npm run build`: the rules cover exactly what Vite wrote to web/dist/assets.
const dist = join(repo, "web/dist");
test("the built _headers covers every file in web/dist/assets", { skip: !existsSync(join(dist, "assets")) && "no build in web/dist" }, () => {
  const files = readdirSync(join(dist, "assets"));
  assert.ok(files.some((f) => f.endsWith(".woff2")), "the font should be one of Vite's hashed assets");
  for (const f of files) assert.ok(isHashed(f), `${f} in web/dist/assets has no content hash`);
  const rules = parseHeaders(readFileSync(join(dist, "_headers"), "utf8"));
  for (const f of files) assert.equal(headersFor(rules, `/assets/${f}`)["cache-control"], IMMUTABLE, f);
  for (const path of ["/", "/levels/index.json", "/assets/not-in-this-build-00000000.js"]) assert.deepEqual(headersFor(rules, path), {}, path);
});
