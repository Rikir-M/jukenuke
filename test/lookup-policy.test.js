const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createLookupPolicy } = require("../src/backend/lookup-policy");

const tick = () => new Promise(setImmediate);
const metadata = {
  title: "Song",
  url: "https://www.youtube.com/watch?v=4csFxGs7fxw",
};

test("duplicates share work; successful results expire and cache size is bounded", async () => {
  let time = 0;
  let calls = 0;
  const lookup = createLookupPolicy(
    async () => {
      calls++;
      return metadata;
    },
    {
      now: () => time,
      ttlMs: 10,
      maxEntries: 1,
    },
  );
  await Promise.all([lookup("a"), lookup("a")]);
  assert.equal(calls, 1);
  const cached = await lookup("a");
  cached.title = "Changed";
  assert.equal((await lookup("a")).title, "Song");
  time = 10;
  await lookup("a");
  assert.equal(calls, 2);
  await lookup("b");
  await lookup("a");
  assert.equal(calls, 4);
});

test("distinct lookups run serially and cancelling one subscriber preserves shared work", async () => {
  const starts = [];
  const releases = [];
  const lookup = createLookupPolicy((input, { signal }) => {
    starts.push(input);
    return new Promise((resolve, reject) => {
      releases.push(() => resolve(metadata));
      signal.addEventListener("abort", () => reject(signal.reason), {
        once: true,
      });
    });
  });
  const controller = new AbortController();
  const first = lookup("a", { signal: controller.signal });
  const shared = lookup("a");
  const second = lookup("b");
  const cancelled = assert.rejects(first, { name: "AbortError" });
  controller.abort();
  await cancelled;
  assert.deepEqual(starts, ["a"]);
  releases.shift()();
  await shared;
  await tick();
  assert.deepEqual(starts, ["a", "b"]);
  releases.shift()();
  await second;
});

test("cancelling all subscribers aborts extraction and removes queued work", async () => {
  const starts = [];
  const lookup = createLookupPolicy(
    (input, { signal }) =>
      new Promise((resolve, reject) => {
        starts.push(input);
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      }),
  );
  const active = new AbortController();
  const queued = new AbortController();
  const a = assert.rejects(lookup("a", { signal: active.signal }), {
    name: "AbortError",
  });
  const b = assert.rejects(lookup("b", { signal: queued.signal }), {
    name: "AbortError",
  });
  queued.abort();
  active.abort();
  await Promise.all([a, b]);
  await tick();
  assert.deepEqual(starts, ["a"]);
});

test("challenges stop queued requests, back off exponentially, and permit cached metadata", async () => {
  let time = 0;
  let calls = 0;
  let fail = false;
  const lookup = createLookupPolicy(
    async () => {
      calls++;
      if (fail) throw new Error("Sign in to confirm you're not a bot");
      return metadata;
    },
    { now: () => time, backoffMs: 1000, maxBackoffMs: 2000 },
  );
  await lookup("cached");
  fail = true;
  await Promise.all([
    assert.rejects(lookup("a"), { code: "YOUTUBE_BACKOFF" }),
    assert.rejects(lookup("b"), { code: "YOUTUBE_BACKOFF" }),
  ]);
  assert.equal(calls, 2);
  await lookup("cached");
  await assert.rejects(lookup("a"), /1 seconds/);
  time = 1000;
  await assert.rejects(lookup("a"), /2 seconds/);
  time = 2000;
  await assert.rejects(lookup("a"), { code: "YOUTUBE_BACKOFF" });
  assert.equal(calls, 3);
  time = 3000;
  fail = false;
  await lookup("a");
  fail = true;
  await assert.rejects(lookup("b"), /1 seconds/);
});

test("ordinary failures are retried without caching or triggering cooldown", async () => {
  let calls = 0;
  const lookup = createLookupPolicy(async () => {
    calls++;
    throw new Error("Video unavailable");
  });
  await assert.rejects(lookup("a"), /Video unavailable/);
  await assert.rejects(lookup("a"), /Video unavailable/);
  assert.equal(calls, 2);
});
