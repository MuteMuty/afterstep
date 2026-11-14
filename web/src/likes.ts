// The like button's logic (lab#17), kept free of the DOM so tests/likes.test.mjs
// can run it in Node. Counts come from the lab hub's like API. This browser keeps
// only its own receipt (to take the like back on any later day): no cookies, and
// nothing about the visitor is sent. Every open tab shares that receipt, and the
// page calls sync() when another tab changes it (lab#37).

export const LIKE_KEY = "afterstep:like";
const RECEIPT = /^[0-9a-f]{32}$/;

export type LikeState = {
  /** The counts loaded: the button may show. Until then (or if they never load) it stays hidden. */
  ready: boolean;
  liked: boolean;
  count: number;
  /** A like or unlike is on its way. */
  busy: boolean;
  /** A short note after a like or unlike didn't go through; "" otherwise. */
  note: string;
};

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Options = {
  fetch: typeof fetch;
  storage: Store | null;
  /** The lab hub's origin, e.g. "https://lab.brightloopapps.com". */
  api: string;
  project: string;
  onChange: (state: LikeState) => void;
  /** Give up on a request after this long. */
  timeoutMs?: number;
};

export const likeLabel = (n: number) => `Like Afterstep, ${n} ${n === 1 ? "like" : "likes"}`;

const NOTES = {
  409: "Someone on this network already liked it today. Thank you!",
  429: "That's a lot of taps. Try again in a minute.",
  other: "That didn't go through. Try again later.",
};

function readReceipt(storage: Store | null): string | null {
  try {
    const v = JSON.parse(storage?.getItem(LIKE_KEY) ?? "null");
    return v && v.liked === true && typeof v.receipt === "string" && RECEIPT.test(v.receipt) ? v.receipt : null;
  } catch {
    return null;
  }
}

export function createLikes({ fetch, storage, api, project, onChange, timeoutMs = 6000 }: Options) {
  const state: LikeState = { ready: false, liked: false, count: 0, busy: false, note: "" };
  // This page's copy of the receipt, so a like can be taken back even where storage can't be used.
  let receipt = readReceipt(storage);
  // Another tab changed the stored like while a press here was on its way.
  let missed = false;

  const set = (next: Partial<LikeState>) => {
    Object.assign(state, next);
    state.count = Math.max(state.liked ? 1 : 0, state.count);
    if (state.ready) onChange(state);
  };
  const remember = (r: string | null) => {
    receipt = r;
    try {
      if (r) storage?.setItem(LIKE_KEY, JSON.stringify({ liked: true, receipt: r }));
      else storage?.removeItem(LIKE_KEY);
    } catch {}
  };
  // Never sends cookies; gives up when the API is slow.
  const call = (path: string, init: RequestInit = {}) =>
    fetch(`${api}/api/likes${path}`, { ...init, credentials: "omit", signal: AbortSignal.timeout(timeoutMs) });
  const total = (data: unknown): number | null => {
    const n = (data as { total?: unknown } | null)?.total;
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  };

  /** Load the counts. Asked quietly: while the hub's likes are resting it answers 204, not an error. */
  async function load() {
    try {
      const r = await call("?quiet=1");
      if (r.status !== 200) return;
      const n = total((await r.json())?.[project]);
      if (n === null) return;
      receipt = readReceipt(storage);
      set({ ready: true, liked: !!receipt, count: n });
    } catch {}
  }

  /** Like, or unlike with the stored receipt. Shows the result right away and settles on the server's count. */
  async function toggle() {
    if (!state.ready || state.busy) return;
    const wasLiked = state.liked;
    const before = state.count;
    const sent = receipt;
    missed = false;
    set({ liked: !wasLiked, count: before + (wasLiked ? -1 : 1), busy: true, note: "" });
    let status = 0;
    let data: unknown = null;
    try {
      const r = wasLiked && sent
        ? await call(`/${project}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ receipt: sent }) })
        : await call(`/${project}`, { method: "POST" });
      status = r.status;
      data = await r.json().catch(() => null);
    } catch {}
    const n = total(data);
    if (wasLiked && (status === 200 || status === 404)) { // 404: that like is already gone
      remember(null);
      set({ liked: false, count: n ?? before - 1, busy: false });
    } else if (!wasLiked && status === 200 && typeof (data as { receipt?: unknown })?.receipt === "string") {
      remember((data as { receipt: string }).receipt);
      set({ liked: true, count: n ?? before + 1, busy: false });
    } else if (missed && !!readReceipt(storage) !== wasLiked) {
      // It didn't go through, but another tab's like or unlike did meanwhile: show that one,
      // on the server's count if it sent one (it already includes that tab's change).
      receipt = readReceipt(storage);
      set({ liked: !wasLiked, count: n ?? before + (wasLiked ? -1 : 1), busy: false });
    } else {
      if (missed) receipt = readReceipt(storage) ?? receipt;
      set({ liked: wasLiked, count: n ?? before, busy: false, note: status === 409 || status === 429 ? NOTES[status] : NOTES.other });
    }
    missed = false;
  }

  /** Another tab liked or unliked (a `storage` event for LIKE_KEY): show it here too, with that
   *  tab's change to the count. A press on its way here isn't disturbed; it catches up when it settles. */
  function sync() {
    if (state.busy) {
      missed = true;
      return;
    }
    receipt = readReceipt(storage);
    if (state.ready && !!receipt !== state.liked) set({ liked: !!receipt, count: state.count + (receipt ? 1 : -1), note: "" });
  }

  return { state, load, toggle, sync };
}
