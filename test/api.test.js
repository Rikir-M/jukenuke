// API tests. They run the real server in dev fake mode, so they need
// no mpv or yt-dlp:   npm test

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { startServer, sleep, waitFor, ROOT } = require("./helpers");

describe("queue, playback and reactions (fake mode)", () => {
  let s;

  before(async () => {
    s = await startServer({ DEV_FAKE_SECONDS: "6" });
  });

  after(() => s.stop());

  test("starts idle, and says it is in fake mode", async () => {
    const state = await s.get("/api/state");

    assert.equal(state.current, null);
    assert.equal(state.paused, false);
    assert.equal(state.volume, 80);
    assert.deepEqual(state.queue, []);
    assert.equal(state.devFake, true);
  });

  test("rejects an empty request", async () => {
    const r = await s.post("/api/queue", { input: "   " });

    assert.equal(r.status, 400);
  });

  test("reacting with nothing playing is a 409", async () => {
    const r = await s.post("/api/react", { songId: 1, emoji: "🔥" });

    assert.equal(r.status, 409);
    assert.equal(r.body.error, "nothing-playing");
  });

  test("a song added to an empty queue starts playing", async () => {
    const r = await s.post("/api/queue", {
      input: "hello world",
      addedBy: "Tester",
    });

    assert.equal(r.status, 200);
    assert.equal(r.body.item.title, "Fake: hello world");

    const state = await s.get("/api/state");

    assert.equal(state.current.title, "Fake: hello world");
    assert.equal(state.current.addedBy, "Tester");
    assert.equal(state.current.duration, 6);
    assert.match(state.current.thumbnail, /^data:image\/svg\+xml/);
  });

  test("the playback position moves forward", async () => {
    const a = (await s.get("/api/state")).current.timePos;

    await sleep(600);

    const b = (await s.get("/api/state")).current.timePos;

    assert.ok(b > a, `expected ${b} > ${a}`);
  });

  test("pause freezes the position and resume continues it", async () => {
    assert.equal((await s.post("/api/pause")).body.paused, true);

    const a = (await s.get("/api/state")).current.timePos;

    await sleep(700);

    const b = (await s.get("/api/state")).current.timePos;

    assert.ok(Math.abs(b - a) < 0.05, `expected frozen, got ${a} -> ${b}`);

    assert.equal((await s.post("/api/resume")).body.paused, false);

    await sleep(500);

    const c = (await s.get("/api/state")).current.timePos;

    assert.ok(c > b + 0.3, `expected moving again, got ${b} -> ${c}`);
  });

  test("volume is clamped, and must be a number", async () => {
    assert.equal(
      (await s.post("/api/volume", { volume: 150 })).body.volume,
      100,
    );
    assert.equal((await s.post("/api/volume", { volume: 42 })).body.volume, 42);
    assert.equal((await s.post("/api/volume", { volume: "loud" })).status, 400);
  });

  test("reactions toggle, and bad ones are refused", async () => {
    const { current } = await s.get("/api/state");

    assert.equal(
      (await s.post("/api/react", { songId: current.id, emoji: "💩" })).status,
      400,
    );
    assert.equal(
      (await s.post("/api/react", { songId: 999, emoji: "🔥" })).body.error,
      "song-changed",
    );

    const on = await s.post("/api/react", {
      songId: current.id,
      emoji: "🔥",
    });

    assert.equal(on.body.reactions["🔥"], 1);
    assert.deepEqual(on.body.myReactions, ["🔥"]);

    const off = await s.post("/api/react", {
      songId: current.id,
      emoji: "🔥",
    });

    assert.equal(off.body.reactions["🔥"], 0);
    assert.deepEqual(off.body.myReactions, []);

    // leave one on, to be saved into history when the song ends
    await s.post("/api/react", { songId: current.id, emoji: "❤️" });
  });

  test('a search starting with "fail" gives the error', async () => {
    const r = await s.post("/api/queue", { input: "fail please" });

    assert.equal(r.status, 500);
    assert.match(r.body.error, /Could not find/);
  });

  test("queued songs can be removed", async () => {
    const r = await s.post("/api/queue", { input: "second song" });
    const id = r.body.item.id;

    assert.equal((await s.get("/api/state")).queue.length, 1);

    await fetch(`${s.url}/api/queue/${id}`, { method: "DELETE" });

    assert.equal((await s.get("/api/state")).queue.length, 0);
  });

  test("skip works without a PIN while protection is disabled", async () => {
    await s.post("/api/queue", { input: "third song" });

    assert.equal((await s.post("/api/skip")).status, 200);

    // the skipped song ends, the next one starts
    await waitFor(
      async () =>
        (await s.get("/api/state")).current?.title === "Fake: third song",
    );
  });

  test("finished songs go into history, with their reactions", async () => {
    const state = await s.get("/api/state");
    const first = state.history.find((h) => h.title === "Fake: hello world");

    assert.ok(first, "the skipped song should be in history");
    assert.equal(first.reactions["❤️"], 1);
  });

  test("stop music clears the queue and the player", async () => {
    await s.post("/api/queue", { input: "fourth song" });
    assert.equal((await s.post("/api/stop-music")).status, 200);

    await waitFor(async () => (await s.get("/api/state")).current === null);

    assert.deepEqual((await s.get("/api/state")).queue, []);
  });

  test("fake mode saves to its own file, not queue.json", () => {
    assert.ok(fs.existsSync(path.join(s.dataDir, "queue.fake.json")));
    assert.ok(!fs.existsSync(path.join(s.dataDir, "queue.json")));
  });
});

describe("abuse guard", () => {
  test("disconnecting during lookup cancels the add and releases its reservation", async () => {
    const s = await startServer({ JUKENUKE_ADD_COOLDOWN_MS: "60000" });
    const http = require("node:http");
    const request = http.request(s.url + "/api/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    request.on("error", () => {});
    try {
      request.end(JSON.stringify({ input: "disconnected song" }));
      await waitFor(() =>
        s.output().includes("Looking up on YouTube: disconnected song"),
      );
      request.destroy();
      await sleep(500);
      const state = await s.get("/api/state");
      assert.equal(state.current, null);
      assert.deepEqual(state.queue, []);
      assert.equal(
        (await s.post("/api/queue", { input: "Retry after disconnect" }))
          .status,
        200,
      );
    } finally {
      request.destroy();
      s.stop();
    }
  });
  test("concurrent adds reserve their slot before lookup", async () => {
    const s = await startServer({ JUKENUKE_ADD_COOLDOWN_MS: "60000" });
    try {
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          s.post("/api/queue", { input: `Concurrent ${i}` }),
        ),
      );
      assert.equal(results.filter((r) => r.status === 200).length, 1);
      assert.equal(results.filter((r) => r.status === 429).length, 7);
      assert.equal(
        (await s.post("/api/queue", { input: "After lookup" })).status,
        429,
      );
    } finally {
      s.stop();
    }
  });

  test("failed lookups release reservations and do not consume cooldown", async () => {
    const s = await startServer({ JUKENUKE_ADD_COOLDOWN_MS: "60000" });
    try {
      assert.equal(
        (await s.post("/api/queue", { input: "fail this" })).status,
        500,
      );
      assert.equal(
        (await s.post("/api/queue", { input: "Try again" })).status,
        200,
      );
    } finally {
      s.stop();
    }
  });

  test("invalid request types and lengths return 400 without adding songs", async () => {
    const s = await startServer();
    try {
      for (const body of [
        { input: 42 },
        { input: [] },
        { input: {} },
        { input: "x".repeat(1001) },
        { input: "song", addedBy: 42 },
        { input: "song", addedBy: "x".repeat(81) },
      ]) {
        assert.equal((await s.post("/api/queue", body)).status, 400);
      }
      assert.equal((await s.get("/api/state")).current, null);
      assert.equal(
        (await s.post("/api/queue", { input: "Valid song" })).status,
        200,
      );
    } finally {
      s.stop();
    }
  });
  test("a second song too soon is a 429", async () => {
    const s = await startServer({ JUKENUKE_ADD_COOLDOWN_MS: "60000" });

    try {
      assert.equal((await s.post("/api/queue", { input: "one" })).status, 200);

      const r = await s.post("/api/queue", { input: "two" });

      assert.equal(r.status, 429);
      assert.match(r.body.error, /Slow down/);
    } finally {
      s.stop();
    }
  });
});

describe("turning fake mode off", () => {
  test("without DEV_FAKE the server runs normally, with no fake-mode traces", async () => {
    const s = await startServer({ DEV_FAKE: undefined });

    try {
      const state = await s.get("/api/state");

      assert.equal("devFake" in state, false);
      assert.ok(!s.output().includes("DEV FAKE"));
      assert.ok(fs.existsSync(path.join(s.dataDir, "queue.json")));
      assert.ok(!fs.existsSync(path.join(s.dataDir, "queue.fake.json")));
    } finally {
      s.stop();
    }
  });

  test("DEV_FAKE together with NODE_ENV=production refuses to start", () => {
    const r = spawnSync(process.execPath, ["server.js"], {
      cwd: ROOT,
      env: {
        ...process.env,
        DEV_FAKE: "1",
        NODE_ENV: "production",
        PORT: "0",
      },
      encoding: "utf8",
      timeout: 5000,
    });

    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /Refusing to start/);
  });
});
