// Unit tests for the like button's logic (web/src/likes.ts): no DOM, a fake
// fetch and a fake localStorage. Run: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { createLikes, LIKE_KEY, likeLabel } from "../web/src/likes.ts";

const API = "https://lab.brightloopapps.com";
const RECEIPT = "0123456789abcdef0123456789abcdef";

function memoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}
const brokenStorage = () => ({ getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); }, removeItem() { throw new Error("denied"); } });

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** A fake fetch that answers from a queue of handlers and records every call. */
function fakeFetch(...answers) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? "GET", body: init.body, credentials: init.credentials, init });
    const a = answers.shift();
    if (!a) throw new Error(`unexpected request ${init.method ?? "GET"} ${url}`);
    return a(url, init);
  };
  f.calls = calls;
  return f;
}
const counts = (total, week = total) => () => json(200, { afterstep: { total, week }, inkchime: { total: 3, week: 1 } });

function setup({ storage = memoryStorage(), answers = [], timeoutMs } = {}) {
  const fetch = fakeFetch(...answers);
  const seen = [];
  const likes = createLikes({ fetch, storage, api: API, project: "afterstep", timeoutMs, onChange: (s) => seen.push({ ...s }) });
  return { likes, fetch, storage, seen };
}

test("load asks quietly for the counts, with no cookies, and shows this project's total", async () => {
  const { likes, fetch } = setup({ answers: [counts(12)] });
  assert.equal(likes.state.ready, false);
  await likes.load();
  assert.equal(fetch.calls[0].url, `${API}/api/likes?quiet=1`);
  assert.equal(fetch.calls[0].method, "GET");
  assert.equal(fetch.calls[0].credentials, "omit");
  assert.deepEqual(likes.state, { ready: true, liked: false, count: 12, busy: false, note: "" });
});

test("load stays hidden on 204 (likes resting), 503, a network error, junk or a missing project", async () => {
  const cases = [
    () => new Response(null, { status: 204 }),
    () => json(503, { error: "Likes are resting right now." }),
    () => { throw new TypeError("Failed to fetch"); },
    () => new Response("not json", { status: 200 }),
    () => json(200, ["nope"]),
    () => json(200, { inkchime: { total: 3, week: 1 } }),
    () => json(200, { afterstep: { total: "12" } }),
  ];
  for (const answer of cases) {
    const { likes, seen } = setup({ answers: [answer] });
    await likes.load();
    assert.equal(likes.state.ready, false);
    assert.equal(seen.length, 0, "a hidden button is never re-rendered");
  }
});

test("load gives up on a slow API and stays hidden", async () => {
  const slow = (_url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)));
  const { likes } = setup({ answers: [slow], timeoutMs: 20 });
  await likes.load();
  assert.equal(likes.state.ready, false);
});

test("liking is optimistic, stores the receipt and settles on the server's count", async () => {
  let resolve;
  const pending = new Promise((r) => (resolve = r));
  const { likes, fetch, storage, seen } = setup({ answers: [counts(12), () => pending] });
  await likes.load();
  const done = likes.toggle();
  assert.deepEqual({ liked: likes.state.liked, count: likes.state.count, busy: likes.state.busy }, { liked: true, count: 13, busy: true });
  assert.equal(fetch.calls[1].url, `${API}/api/likes/afterstep`);
  assert.equal(fetch.calls[1].method, "POST");
  assert.equal(fetch.calls[1].credentials, "omit");
  resolve(json(200, { receipt: RECEIPT, total: 15, week: 4 }));
  await done;
  assert.deepEqual(likes.state, { ready: true, liked: true, count: 15, busy: false, note: "" });
  assert.deepEqual(JSON.parse(storage.getItem(LIKE_KEY)), { liked: true, receipt: RECEIPT });
  assert.ok(seen.length >= 2);
});

test("a like survives a reload, and unliking sends the stored receipt, even on a later day", async () => {
  const storage = memoryStorage();
  const first = setup({ storage, answers: [counts(12), () => json(200, { receipt: RECEIPT, total: 13, week: 13 })] });
  await first.likes.load();
  await first.likes.toggle();

  // Reload (any later day: the receipt has no date).
  const again = setup({ storage, answers: [counts(13), () => json(200, { ok: true, total: 12, week: 0 })] });
  await again.likes.load();
  assert.deepEqual({ liked: again.likes.state.liked, count: again.likes.state.count }, { liked: true, count: 13 });
  const done = again.likes.toggle();
  assert.deepEqual({ liked: again.likes.state.liked, count: again.likes.state.count }, { liked: false, count: 12 });
  await done;
  const del = again.fetch.calls[1];
  assert.equal(del.method, "DELETE");
  assert.equal(del.url, `${API}/api/likes/afterstep`);
  assert.equal(del.init.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(del.body), { receipt: RECEIPT });
  assert.equal(storage.getItem(LIKE_KEY), null);
  assert.deepEqual(again.likes.state, { ready: true, liked: false, count: 12, busy: false, note: "" });
});

test("unliking a like the server no longer has (404) still unlikes here", async () => {
  const storage = memoryStorage({ [LIKE_KEY]: JSON.stringify({ liked: true, receipt: RECEIPT }) });
  const { likes } = setup({ storage, answers: [counts(5), () => json(404, { error: "That like wasn't found.", total: 4, week: 0 })] });
  await likes.load();
  await likes.toggle();
  assert.deepEqual({ liked: likes.state.liked, count: likes.state.count, note: likes.state.note }, { liked: false, count: 4, note: "" });
  assert.equal(storage.getItem(LIKE_KEY), null);
});

test("409 (this network already liked it today) rolls back and says so politely", async () => {
  const { likes, storage } = setup({ answers: [counts(12), () => json(409, { error: "This network already liked it today.", total: 14, week: 2 })] });
  await likes.load();
  await likes.toggle();
  assert.equal(likes.state.liked, false);
  assert.equal(likes.state.count, 14, "takes the server's count when it sends one");
  assert.match(likes.state.note, /already liked .*today/i);
  assert.equal(storage.getItem(LIKE_KEY), null);
});

test("429 rolls back a like or an unlike and asks to try again in a minute", async () => {
  const like = setup({ answers: [counts(12), () => json(429, { error: "That's a lot of likes." })] });
  await like.likes.load();
  await like.likes.toggle();
  assert.deepEqual({ liked: like.likes.state.liked, count: like.likes.state.count }, { liked: false, count: 12 });
  assert.match(like.likes.state.note, /in a minute/);

  const storage = memoryStorage({ [LIKE_KEY]: JSON.stringify({ liked: true, receipt: RECEIPT }) });
  const unlike = setup({ storage, answers: [counts(12), () => json(429, { error: "That's a lot of likes." })] });
  await unlike.likes.load();
  await unlike.likes.toggle();
  assert.deepEqual({ liked: unlike.likes.state.liked, count: unlike.likes.state.count }, { liked: true, count: 12 });
  assert.match(unlike.likes.state.note, /in a minute/);
  assert.deepEqual(JSON.parse(storage.getItem(LIKE_KEY)), { liked: true, receipt: RECEIPT }, "the receipt is kept");
});

test("a failed like (503, offline, slow) rolls back and keeps the last known count", async () => {
  const slow = (_url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)));
  for (const fail of [() => json(503, { error: "Likes are resting right now." }), () => { throw new TypeError("Failed to fetch"); }, slow]) {
    const { likes } = setup({ answers: [counts(12), fail], timeoutMs: 20 });
    await likes.load();
    await likes.toggle();
    assert.deepEqual({ ready: likes.state.ready, liked: likes.state.liked, count: likes.state.count, busy: likes.state.busy }, { ready: true, liked: false, count: 12, busy: false });
    assert.ok(likes.state.note.length > 0);
  }
});

test("a press while one is in flight does nothing; the next press clears the note", async () => {
  let resolve;
  const { likes, fetch } = setup({ answers: [counts(1), () => json(429, {}), () => new Promise((r) => (resolve = r))] });
  await likes.load();
  await likes.toggle();
  assert.ok(likes.state.note);
  const second = likes.toggle();
  assert.equal(likes.state.note, "");
  await likes.toggle(); // ignored while busy
  assert.equal(fetch.calls.length, 3);
  resolve(json(200, { receipt: RECEIPT, total: 2, week: 2 }));
  await second;
  assert.deepEqual({ liked: likes.state.liked, count: likes.state.count }, { liked: true, count: 2 });
});

test("toggle before the counts load does nothing", async () => {
  const { likes, fetch } = setup();
  await likes.toggle();
  assert.equal(fetch.calls.length, 0);
});

test("a liked count never shows below 1, an unliked one never below 0", async () => {
  const storage = memoryStorage({ [LIKE_KEY]: JSON.stringify({ liked: true, receipt: RECEIPT }) });
  const { likes } = setup({ storage, answers: [counts(0)] });
  await likes.load();
  assert.equal(likes.state.count, 1);
});

test("storage that can't be used still likes and unlikes within this page", async () => {
  const { likes, fetch } = setup({ storage: brokenStorage(), answers: [counts(3), () => json(200, { receipt: RECEIPT, total: 4, week: 4 }), () => json(200, { ok: true, total: 3, week: 3 })] });
  await likes.load();
  await likes.toggle();
  assert.equal(likes.state.liked, true);
  await likes.toggle();
  assert.deepEqual(JSON.parse(fetch.calls[2].body), { receipt: RECEIPT });
  assert.equal(likes.state.liked, false);
});

test("stored junk reads as not liked", async () => {
  for (const raw of ["not json", "null", "[]", JSON.stringify({ liked: true }), JSON.stringify({ liked: true, receipt: "short" })]) {
    const { likes } = setup({ storage: memoryStorage({ [LIKE_KEY]: raw }), answers: [counts(2)] });
    await likes.load();
    assert.equal(likes.state.liked, false, raw);
  }
});

test("the label names the game and the count", () => {
  assert.equal(likeLabel(12), "Like Afterstep, 12 likes");
  assert.equal(likeLabel(1), "Like Afterstep, 1 like");
  assert.equal(likeLabel(0), "Like Afterstep, 0 likes");
});
