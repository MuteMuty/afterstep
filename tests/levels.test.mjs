// Unit tests for loading levels (web/src/levels.ts, lab#40): no DOM, and fetch is
// faked, so nothing goes over the network.
// Run: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchChecked, isLevel, isIndex } from "../web/src/levels.ts";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const daily = readdirSync(join(repo, "levels/daily")).filter((f) => f.endsWith(".json")).sort();
const aDaily = JSON.parse(readFileSync(join(repo, "levels/daily", daily[0]), "utf8"));
const aLesson = JSON.parse(readFileSync(join(repo, "levels/tutorial", readdirSync(join(repo, "levels/tutorial")).filter((f) => f.endsWith(".json")).sort()[0]), "utf8"));

/** A fake fetch answering every request with `status` and `body` (a string, sent as is). */
const answer = (status, body) => async () => new Response(body, { status, headers: { "content-type": "application/json" } });

test("isLevel takes the real level files", () => {
  for (const f of daily) assert.ok(isLevel(JSON.parse(readFileSync(join(repo, "levels/daily", f), "utf8"))), f);
  for (const f of readdirSync(join(repo, "levels/tutorial")).filter((f) => f.endsWith(".json")))
    assert.ok(isLevel(JSON.parse(readFileSync(join(repo, "levels/tutorial", f), "utf8"))), f);
});

test("isLevel turns away anything the game can't build a board from", () => {
  for (const bad of [
    null, undefined, 3, "S..E", [], {},
    { ...aDaily, grid: undefined },
    { ...aDaily, grid: [] },
    { ...aDaily, grid: "S..E" },
    { ...aDaily, grid: [1, 2] },
    { ...aDaily, grid: ["S..", "..E."] },
    { ...aDaily, grid: [""] },
    { ...aDaily, delay: undefined },
    { ...aDaily, delay: "3" },
    { ...aDaily, delay: 0 },
    { ...aDaily, delay: 1.5 },
  ]) assert.equal(isLevel(bad), false, JSON.stringify(bad));
});

test("isIndex takes the index the build writes, and turns away one without its lists", () => {
  const index = { daily: [{ id: 1, date: "2026-11-10", tier: "easy", par: 9 }], tutorial: [aLesson] };
  assert.equal(isIndex(index), true);
  for (const bad of [null, [], {}, { daily: [] }, { tutorial: [aLesson] }, { daily: {}, tutorial: [aLesson] }, { daily: [], tutorial: [{}] }, { daily: [{ id: 1 }], tutorial: [aLesson] }])
    assert.equal(isIndex(bad), false, JSON.stringify(bad));
});

test("fetchChecked gives the level when the request works", async () => {
  const seen = [];
  const fetch = async (url) => { seen.push(url); return new Response(JSON.stringify(aDaily), { status: 200 }); };
  assert.deepEqual(await fetchChecked(fetch, "/levels/daily/x.json", isLevel), aDaily);
  assert.deepEqual(seen, ["/levels/daily/x.json"]);
});

test("fetchChecked gives null, never a rejection, when offline, refused, not JSON or not a level", async () => {
  const cases = {
    offline: async () => { throw new TypeError("Failed to fetch"); },
    "fetch that throws at once": () => { throw new TypeError("Failed to fetch"); },
    404: answer(404, "Not found"),
    "404 with a level-shaped body": answer(404, JSON.stringify(aDaily)),
    500: answer(500, ""),
    "an HTML page": answer(200, "<!doctype html><title>Afterstep</title>"),
    "empty body": answer(200, ""),
    "cut-off JSON": answer(200, JSON.stringify(aDaily).slice(0, 20)),
    "JSON, but not a level": answer(200, JSON.stringify({ hello: "world" })),
    "a body that fails while reading": async () => ({ ok: true, status: 200, json: async () => { throw new TypeError("network error"); } }),
  };
  for (const [label, fetch] of Object.entries(cases)) {
    assert.equal(await fetchChecked(fetch, "/levels/daily/x.json", isLevel), null, label);
  }
});
