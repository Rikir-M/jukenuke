// Plays audio through mpv, and talks to it over its IPC socket.

const { spawn } = require("child_process");
const net = require("net");
const { MPV_SOCKET } = require("../config");

const { createControls } = require("./mpv-control");
let activeControls = null;

function spawnPlayer(item, volume) {
  activeControls?.stop();
  const controls = createControls();
  activeControls = controls;
  const player = spawn("mpv", [
    "--no-video",
    "--no-terminal",
    "--ytdl-format=bestaudio/best",
    `--volume=${volume}`,
    `--input-ipc-server=${MPV_SOCKET}`,
    item.target,
  ]);
  const finish = () => {
    controls.stop();
    if (activeControls === controls) activeControls = null;
  };
  player.once("error", finish);
  player.once("close", finish);
  return player;
}

function sendCommand(command) {
  if (!activeControls) return Promise.reject(new Error("No active player"));
  return activeControls.send(command);
}

// Reads properties back from mpv over the same IPC socket (playback
// position, duration, etc). Resolves with whatever came back before
// the timeout; anything missing is just left out of the result.
function queryProperties(properties, timeoutMs = 400) {
  return new Promise((resolve) => {
    const result = {};
    const sock = net.createConnection(MPV_SOCKET);

    let buffer = "";
    let pending = properties.length;
    const received = new Set();

    const finish = () => {
      clearTimeout(timer);
      sock.destroy();
      resolve(result);
    };

    const timer = setTimeout(finish, timeoutMs);

    sock.on("connect", () => {
      properties.forEach((prop, requestId) => {
        sock.write(
          JSON.stringify({
            command: ["get_property", prop],
            request_id: requestId,
          }) + "\n",
        );
      });
    });

    sock.on("data", (data) => {
      buffer += data.toString();

      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;

        let msg;

        try {
          msg = JSON.parse(line);
        } catch (e) {
          continue;
        }

        if (
          Number.isInteger(msg.request_id) &&
          msg.request_id >= 0 &&
          msg.request_id < properties.length &&
          !received.has(msg.request_id)
        ) {
          received.add(msg.request_id);
          if (msg.error === "success") {
            result[properties[msg.request_id]] = msg.data;
          }
          pending--;
        }
      }

      if (pending <= 0) {
        finish();
      }
    });

    sock.on("error", finish);
    sock.on("end", finish);
  });
}

module.exports = { spawnPlayer, sendCommand, queryProperties };
