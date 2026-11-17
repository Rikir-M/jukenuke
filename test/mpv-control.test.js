const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const net = require("node:net");
const { createControls } = require("../src/backend/mpv-control");

test("startup commands retry, wait for acknowledgment and preserve order", async () => {
  const original = net.createConnection;
  const controls = createControls();
  let attempts = 0;
  const commands = [];
  net.createConnection = () => {
    const socket = new EventEmitter();
    socket.destroy = () => {};
    const fail = ++attempts === 1;
    socket.write = (data) => {
      commands.push(JSON.parse(data).command);
      setImmediate(() =>
        socket.emit(
          "data",
          Buffer.from('{"request_id":1,"error":"success"}\n'),
        ),
      );
    };
    setImmediate(() =>
      socket.emit(
        fail ? "error" : "connect",
        fail ? new Error("not ready") : undefined,
      ),
    );
    return socket;
  };
  try {
    await Promise.all([
      controls.send(["set_property", "pause", true]),
      controls.send(["set_property", "volume", 20]),
      controls.send(["set_property", "pause", false]),
    ]);
    assert.equal(attempts, 4);
    assert.deepEqual(commands, [
      ["set_property", "pause", true],
      ["set_property", "volume", 20],
      ["set_property", "pause", false],
    ]);
  } finally {
    controls.stop();
    net.createConnection = original;
  }
});

test("unacknowledged commands time out instead of reporting success", async () => {
  const original = net.createConnection;
  const controls = createControls();
  net.createConnection = () => {
    const socket = new EventEmitter();
    socket.destroy = () => {};
    socket.write = () => {};
    setImmediate(() => socket.emit("connect"));
    return socket;
  };
  try {
    await assert.rejects(
      controls.send(["set_property", "pause", true], 30),
      /timed out/,
    );
  } finally {
    controls.stop();
    net.createConnection = original;
  }
});

test("ending a player cancels its pending commands before another track starts", async () => {
  const original = net.createConnection;
  const controls = createControls();
  let connections = 0;
  net.createConnection = () => {
    connections++;
    const socket = new EventEmitter();
    socket.destroy = () => {};
    setImmediate(() => socket.emit("error", new Error("not ready")));
    return socket;
  };
  try {
    const pending = controls.send(["set_property", "pause", true]);
    const rejected = assert.rejects(pending, { name: "AbortError" });
    await new Promise(setImmediate);
    controls.stop();
    await rejected;
    await assert.rejects(controls.send(["set_property", "volume", 10]), {
      name: "AbortError",
    });
    assert.equal(connections, 1);
  } finally {
    controls.stop();
    net.createConnection = original;
  }
});
