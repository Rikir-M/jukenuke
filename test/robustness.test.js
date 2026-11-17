const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { spawnSync } = require("node:child_process");

const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "jukenuke-robustness-"),
);
process.env.JUKENUKE_DATA_DIR = directory;
process.env.DEV_FAKE = "1";
const backend = require("../src/backend");
const { state, runtime, save } = require("../src/state");
const {
  playNext,
  getPlayback,
  pause,
  setVolume,
  clearQueueAndStop,
} = require("../src/player");
const { lookup } = require("../src/lookup");
const abuseGuard = require("../src/abuseGuard");
const song = (id) => ({
  id,
  title: `Song ${id}`,
  target: "https://www.youtube.com/watch?v=abcdefghijk",
});
after(() => fs.rmSync(directory, { recursive: true, force: true }));

test("playback distinguishes loading, playing, buffering and paused tracks", async () => {
  const original = backend.queryProperties;
  runtime.current = song(90);
  try {
    for (const [properties, paused, expected] of [
      [{}, false, "loading"],
      [{ "time-pos": 0, duration: 180, "core-idle": false }, false, "playing"],
      [{ "time-pos": 5, "paused-for-cache": true }, false, "buffering"],
      [{ "time-pos": 5, "core-idle": true }, false, "buffering"],
      [{ "time-pos": 5, "core-idle": true }, true, "paused"],
      [{ "time-pos": null }, false, "loading"],
    ]) {
      backend.queryProperties = async () => properties;
      runtime.paused = paused;
      assert.equal((await getPlayback()).playbackStatus, expected);
    }
  } finally {
    backend.queryProperties = original;
    runtime.current = null;
    runtime.paused = false;
  }
});

test("a track change during a property query cannot report the old playback position", async () => {
  const original = backend.queryProperties;
  runtime.current = song(91);
  backend.queryProperties = async () => {
    runtime.current = song(92);
    return { "time-pos": 90, duration: 100 };
  };
  try {
    assert.deepEqual(await getPlayback(), {
      timePos: null,
      duration: null,
      playbackStatus: "loading",
    });
  } finally {
    backend.queryProperties = original;
    runtime.current = null;
  }
});

test("mpv property errors complete promptly without waiting for the IPC timeout", async () => {
  const net = require("node:net");
  const mpv = require("../src/backend/mpv");
  const original = net.createConnection;
  const socket = new EventEmitter();
  socket.write = () => {};
  socket.destroy = () => {};
  net.createConnection = () => socket;
  try {
    let settled = false;
    const pending = mpv.queryProperties(["time-pos", "duration"], 10000);
    pending.then(() => {
      settled = true;
    });
    socket.emit("connect");
    socket.emit(
      "data",
      Buffer.from(
        '{"request_id":0,"error":"property unavailable"}\n{"request_id":1,"error":"success","data":180}\n',
      ),
    );
    await Promise.resolve();
    assert.equal(settled, true);
    assert.deepEqual(await pending, { duration: 180 });
  } finally {
    socket.emit("end");
    net.createConnection = original;
  }
});

test("global lookup concurrency is bounded and released slots can be reused", () => {
  const ips = ["test1", "test2", "test3", "test4", "test5"];
  try {
    for (const ip of ips.slice(0, 4))
      assert.equal(abuseGuard.reserveLookup(ip, Date.now()), null);
    assert.match(abuseGuard.reserveLookup(ips[4], Date.now()), /Too many/);
    abuseGuard.releaseLookup(ips[0]);
    assert.equal(abuseGuard.reserveLookup(ips[4], Date.now()), null);
  } finally {
    ips.forEach(abuseGuard.releaseLookup);
  }
});

test("error followed by close advances playback only once", async () => {
  const original = backend.spawnPlayer;
  const players = [];
  backend.spawnPlayer = () => {
    const player = new EventEmitter();
    player.stdout = new EventEmitter();
    player.stderr = new EventEmitter();
    players.push(player);
    return player;
  };
  try {
    state.queue = [song(1), song(2), song(3)];
    state.history = [];
    runtime.current = null;
    playNext();
    players[0].emit("error", new Error("mpv missing"));
    await new Promise(setImmediate);
    assert.equal(runtime.current.id, 2);
    players[0].emit("close", -1);
    assert.equal(runtime.current.id, 2);
    assert.equal(players.length, 2);
    assert.deepEqual(state.history, []);
    assert.equal(state.queue[0].id, 3);
  } finally {
    backend.spawnPlayer = original;
    runtime.current = null;
    state.queue = [];
  }
});

test("lookup timeout aborts the backend and releases a hung promise", async () => {
  const original = backend.lookup;
  let signal;
  backend.lookup = (_, options) => {
    signal = options.signal;
    return new Promise(() => {});
  };
  try {
    await assert.rejects(lookup("song", undefined, 20), {
      code: "LOOKUP_TIMEOUT",
    });
    assert.equal(signal.aborted, true);
  } finally {
    backend.lookup = original;
  }
});

test("lookup cancellation reaches the backend", async () => {
  const controller = new AbortController();
  const pending = lookup("song", controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
});

test("failed atomic replacement preserves the last saved queue", () => {
  state.queue = [song(4)];
  save();
  const file = path.join(directory, "queue.fake.json");
  const before = fs.readFileSync(file, "utf8");
  const original = fs.renameSync;
  fs.renameSync = () => {
    throw new Error("disk unavailable");
  };
  try {
    state.queue.push(song(5));
    assert.equal(save(), false);
    assert.equal(runtime.persistenceError, true);
    assert.equal(fs.readFileSync(file, "utf8"), before);
    assert.equal(
      fs.readdirSync(directory).some((name) => name.endsWith(".tmp")),
      false,
    );
  } finally {
    fs.renameSync = original;
  }
  assert.equal(save(), true);
  assert.equal(runtime.persistenceError, false);
});

test("save failures do not prevent playback transitions or stopping", async () => {
  const originalSpawn = backend.spawnPlayer;
  const originalRename = fs.renameSync;
  const players = [];
  backend.spawnPlayer = () => {
    const player = new EventEmitter();
    player.stdout = new EventEmitter();
    player.stderr = new EventEmitter();
    player.kill = () => {
      player.emit("close", null);
    };
    players.push(player);
    return player;
  };
  try {
    state.queue = [song(201), song(202)];
    state.history = [];
    runtime.current = null;
    playNext();
    fs.renameSync = () => {
      throw new Error("disk unavailable");
    };
    assert.doesNotThrow(() => players[0].emit("close", 0));
    await new Promise(setImmediate);
    assert.equal(runtime.current.id, 202);
    assert.equal(runtime.persistenceError, true);
    assert.doesNotThrow(clearQueueAndStop);
    await new Promise(setImmediate);
    assert.equal(runtime.current, null);
    assert.deepEqual(state.queue, []);
  } finally {
    fs.renameSync = originalRename;
    backend.spawnPlayer = originalSpawn;
    runtime.current = null;
    state.queue = [];
    save();
  }
});

test("failed or outdated player commands do not update the pause and volume state", async () => {
  const original = backend.sendCommand;
  runtime.current = song(203);
  runtime.paused = false;
  const volume = runtime.volume;
  try {
    backend.sendCommand = async () => {
      throw new Error("IPC unavailable");
    };
    await assert.rejects(pause(), /IPC unavailable/);
    assert.equal(runtime.paused, false);
    await assert.rejects(setVolume(20), /IPC unavailable/);
    assert.equal(runtime.volume, volume);
    let release;
    backend.sendCommand = () =>
      new Promise((resolve) => {
        release = resolve;
      });
    const pending = pause();
    runtime.current.stopping = true;
    release();
    await assert.rejects(pending, /Track changed/);
    assert.equal(runtime.paused, false);
  } finally {
    backend.sendCommand = original;
    runtime.current = null;
  }
});

test("invalid saved structure is backed up and does not crash startup", () => {
  for (const value of [
    "{",
    '{"queue":{},"history":[]}',
    '{"queue":[{"id":1}],"history":[]}',
  ]) {
    fs.writeFileSync(path.join(directory, "queue.fake.json"), value);
    const result = spawnSync(
      process.execPath,
      [
        "-e",
        'const {state,save}=require("./src/state"); save(); console.log(JSON.stringify(state))',
      ],
      {
        cwd: path.join(__dirname, ".."),
        env: process.env,
        encoding: "utf8",
        timeout: 5000,
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { queue: [], history: [] });
    assert.ok(
      fs
        .readdirSync(directory)
        .filter((name) => name.includes(".invalid-"))
        .some(
          (name) =>
            fs.readFileSync(path.join(directory, name), "utf8") === value,
        ),
    );
  }
});
