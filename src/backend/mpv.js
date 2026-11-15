// Plays audio through mpv, and talks to it over its IPC socket.

const { spawn } = require('child_process');
const net = require('net');
const { MPV_SOCKET } = require('../config');

function spawnPlayer(item, volume) {
  return spawn('mpv', [
    '--no-video',
    '--no-terminal',
    '--ytdl-format=bestaudio/best',
    `--volume=${volume}`,
    `--input-ipc-server=${MPV_SOCKET}`,
    item.target
  ]);
}

// Fire-and-forget: ['set_property', 'pause', true] etc.
function sendCommand(commandArr) {
  const sock = net.createConnection(MPV_SOCKET);

  sock.on('connect', () => {
    sock.write(JSON.stringify({ command: commandArr }) + '\n');
    sock.end();
  });

  // mpv might not be running yet, or the socket not ready — fine, just drop it.
  sock.on('error', () => {});
}

// Reads properties back from mpv over the same IPC socket (playback
// position, duration, etc). Resolves with whatever came back before
// the timeout; anything missing is just left out of the result.
function queryProperties(properties, timeoutMs = 400) {
  return new Promise((resolve) => {
    const result = {};
    const sock = net.createConnection(MPV_SOCKET);

    let buffer = '';
    let pending = properties.length;

    const finish = () => {
      clearTimeout(timer);
      sock.destroy();
      resolve(result);
    };

    const timer = setTimeout(finish, timeoutMs);

    sock.on('connect', () => {
      properties.forEach((prop, requestId) => {
        sock.write(
          JSON.stringify({
            command: ['get_property', prop],
            request_id: requestId
          }) + '\n'
        );
      });
    });

    sock.on('data', (data) => {
      buffer += data.toString();

      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;

        let msg;

        try {
          msg = JSON.parse(line);
        } catch (e) {
          continue;
        }

        if (typeof msg.request_id === 'number' && msg.error === 'success') {
          result[properties[msg.request_id]] = msg.data;
          pending--;
        }
      }

      if (pending <= 0) {
        finish();
      }
    });

    sock.on('error', finish);
  });
}

module.exports = { spawnPlayer, sendCommand, queryProperties };
