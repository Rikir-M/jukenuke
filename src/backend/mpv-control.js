const net = require("net");
const { MPV_SOCKET } = require("../config");

// A controller belongs to one mpv process; its commands never reach a successor.
function createControls() {
  const controller = new AbortController();
  const { signal } = controller;
  let commands = Promise.resolve();

  function send(command, timeoutMs = 3000) {
    const deadline = Date.now() + timeoutMs;
    const pending = commands
      .catch(() => {})
      .then(async () => {
        while (Date.now() < deadline) {
          signal.throwIfAborted();
          try {
            await attempt(
              command,
              signal,
              Math.min(400, deadline - Date.now()),
            );
            return;
          } catch (error) {
            signal.throwIfAborted();
            if (error.code === "COMMAND_REJECTED") throw error;
            await new Promise((resolve) => {
              const wake = () => {
                clearTimeout(timer);
                signal.removeEventListener("abort", wake);
                resolve();
              };
              const timer = setTimeout(
                wake,
                Math.min(100, Math.max(0, deadline - Date.now())),
              );
              signal.addEventListener("abort", wake, { once: true });
            });
          }
        }
        throw new Error("Player control timed out");
      });
    commands = pending;
    return pending;
  }

  return { send, stop: () => controller.abort() };
}

function attempt(command, signal, timeoutMs) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection(MPV_SOCKET);
    let buffer = "";
    let finished = false;
    const finish = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      sock.destroy();
      if (error) reject(error);
      else resolve();
    };
    const abort = () => finish(signal.reason);
    const timer = setTimeout(
      () => finish(new Error("Player did not acknowledge command")),
      timeoutMs,
    );
    signal.addEventListener("abort", abort, { once: true });
    sock.on("error", finish);
    sock.on("end", () => finish(new Error("Player connection ended")));
    sock.on("connect", () => {
      if (!finished)
        sock.write(JSON.stringify({ command, request_id: 1 }) + "\n");
    });
    sock.on("data", (data) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        let response;
        try {
          response = JSON.parse(line);
        } catch {
          continue;
        }
        if (response.request_id !== 1) continue;
        finish(
          response.error === "success"
            ? null
            : Object.assign(new Error("Player rejected command"), {
                code: "COMMAND_REJECTED",
              }),
        );
      }
    });
    if (signal.aborted) abort();
  });
}

module.exports = { createControls };
