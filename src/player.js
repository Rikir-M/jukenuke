// The player: starts the next queued song, and handles pause, skip,
// volume and stopping. Talks to mpv (or the dev fake) through the
// backend, and never cares which one it is.

const backend = require("./backend");
const config = require("./config");
const { state, runtime, save } = require("./state");
const reactions = require("./reactions");
const abuseGuard = require("./abuseGuard");

function playNext() {
  if (runtime.current || runtime.paused) {
    return;
  }

  const item = state.queue.shift();

  if (!item) {
    save();
    return;
  }

  console.log(
    `Now playing: ${item.title} (added by ${item.addedBy || "someone"})`,
  );

  let player;
  try {
    player = backend.spawnPlayer(item, runtime.volume);
  } catch (err) {
    console.error("Player failed to start:", err.message);
    abuseGuard.forgetItem(item.id);
    save();
    setImmediate(playNext);
    return;
  }
  const voters = reactions.newVoters();

  runtime.current = {
    ...item,
    startedAt: Date.now(),
    player,
    reactionVoters: voters,
  };

  player.stderr.on("data", (data) => {
    const message = data.toString().trim();
    if (message) console.error(`[player] ${message}`);
  });

  player.stdout.on("data", (data) => {
    const message = data.toString().trim();
    if (message) console.log(`[player] ${message}`);
  });

  let finished = false;
  function finish(code, failed = false) {
    if (finished) return;
    finished = true;
    console.log(`Finished: ${item.title} (exit ${code})`);

    const finalCounts = reactions.counts(voters);
    const gotReactions = Object.values(finalCounts).some((n) => n > 0);

    if (!failed)
      state.history.unshift({
        ...item,
        ...(gotReactions ? { reactions: finalCounts } : {}),
        endedAt: Date.now(),
      });
    state.history = state.history.slice(0, config.HISTORY_LIMIT);

    abuseGuard.forgetItem(item.id);
    runtime.current = null;

    save();
    setImmediate(playNext);
  }

  player.on("close", (code) => finish(code));

  player.on("error", (err) => {
    console.error("Player failed to start:", err.message);

    finish(null, true);
  });

  save();
}

function skipCurrent() {
  if (runtime.current && runtime.current.player) {
    runtime.current.player.kill("SIGTERM");
    // The close handler will call playNext().
  }
}

function pause() {
  runtime.paused = true;

  // Actually pause the audio, not just gate whether the next song starts.
  if (runtime.current) {
    backend.sendCommand(["set_property", "pause", true]);
  }
}

function resume() {
  runtime.paused = false;

  if (runtime.current) {
    backend.sendCommand(["set_property", "pause", false]);
  } else {
    // Nothing was mid-playback (e.g. paused while the queue was
    // empty) — see if there's something to start now.
    playNext();
  }
}

function setVolume(value) {
  runtime.volume = Math.max(0, Math.min(100, value));

  backend.sendCommand(["set_property", "volume", runtime.volume]);

  return runtime.volume;
}

// Clears everything waiting and stops what's playing.
function clearQueueAndStop() {
  abuseGuard.forgetAllQueued();
  state.queue = [];

  save();
  skipCurrent();
}

// Playback position of the current song, if the player can say.
async function getPlayback() {
  let timePos = null;
  let duration = null;

  const current = runtime.current;
  if (current) {
    const props = await backend.queryProperties(["time-pos", "duration"]);
    if (runtime.current !== current) return { timePos, duration };

    if (typeof props["time-pos"] === "number") timePos = props["time-pos"];
    if (typeof props.duration === "number") duration = props.duration;
  }

  return { timePos, duration };
}

module.exports = {
  playNext,
  skipCurrent,
  pause,
  resume,
  setVolume,
  clearQueueAndStop,
  getPlayback,
};
