// The player: starts the next queued song, and handles pause, skip,
// volume and stopping. Talks to mpv (or the dev fake) through the
// backend, and never cares which one it is.

const backend = require("./backend");
const config = require("./config");
const { state, runtime, save } = require("./state");
const reactions = require("./reactions");
const abuseGuard = require("./abuseGuard");
const { cancelLookups } = require("./lookup");

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
  // Next ends the current track's pause, even when there is no next track yet.
  runtime.paused = false;
  if (runtime.current && runtime.current.player) {
    runtime.current.stopping = true;
    runtime.current.player.kill("SIGTERM");
    // The close handler will call playNext().
  } else {
    playNext();
  }
}

async function controlCurrent(command) {
  const current = runtime.current;
  if (!current) return;
  await backend.sendCommand(command);
  if (runtime.current !== current || current.stopping)
    throw new Error("Track changed during player command");
}

async function pause() {
  // Actually pause the audio, not just gate whether the next song starts.
  if (runtime.current) {
    await controlCurrent(["set_property", "pause", true]);
  }
  runtime.paused = true;
}

async function resume() {
  if (runtime.current) {
    await controlCurrent(["set_property", "pause", false]);
    runtime.paused = false;
  } else {
    runtime.paused = false;
    // Nothing was mid-playback (e.g. paused while the queue was
    // empty) — see if there's something to start now.
    playNext();
  }
}

async function setVolume(value) {
  const volume = Math.max(0, Math.min(100, value));
  if (runtime.current) await controlCurrent(["set_property", "volume", volume]);
  runtime.volume = volume;

  return runtime.volume;
}

// Clears everything waiting and stops what's playing.
function clearQueueAndStop() {
  cancelLookups();
  abuseGuard.forgetAllQueued();
  state.queue = [];

  save();
  skipCurrent();
}

// Playback position of the current song, if the player can say.
async function getPlayback() {
  let timePos = null;
  let duration = null;
  let playbackStatus = "loading";

  const current = runtime.current;
  if (current) {
    const props = await backend.queryProperties([
      "time-pos",
      "duration",
      "core-idle",
      "paused-for-cache",
    ]);
    if (runtime.current !== current)
      return { timePos, duration, playbackStatus };

    if (Number.isFinite(props["time-pos"])) timePos = props["time-pos"];
    if (Number.isFinite(props.duration)) duration = props.duration;
    if (timePos !== null) {
      playbackStatus = runtime.paused
        ? "paused"
        : props["paused-for-cache"] === true || props["core-idle"] === true
          ? "buffering"
          : "playing";
    }
  }

  return { timePos, duration, playbackStatus };
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
