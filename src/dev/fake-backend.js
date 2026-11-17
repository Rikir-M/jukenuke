// DEV FAKE MODE — everything about it lives in this file.
//
// Songs are "looked up" and "played" on a timer, with no audio and
// no yt-dlp or mpv, so the page can be worked on from any computer.
//
//   npm run dev:fake            (or DEV_FAKE=1 node server.js)
//
// Options:
//   DEV_FAKE_SECONDS=8          fix every song's length (default 20-40s)
//
// Type a song starting with "fail" to test the error toast.
//
// Never loaded unless DEV_FAKE is on — see src/backend/index.js.
// Delete this folder for a production build.

const crypto = require("crypto");
const { EventEmitter } = require("events");
const { QUEUE_FILE } = require("../config");
const path = require("path");
const { isYouTubeUrl, extractYouTubeId } = require("../backend/youtube");

const FIXED_SECONDS = Number(process.env.DEV_FAKE_SECONDS) || null;

function hashNumber(str) {
  return crypto.createHash("md5").update(str).digest().readUInt32BE(0);
}

// Stand-in for the mpv child process: counts a playback position up on a
// timer (frozen while paused) and "exits" when the song is over.
class FakePlayer extends EventEmitter {
  constructor(durationSec) {
    super();

    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();

    this.duration = durationSec;
    this.position = 0;
    this.paused = false;
    this.finished = false;
    this.lastTick = Date.now();

    this.timer = setInterval(() => this.tick(), 250);
  }

  tick() {
    const now = Date.now();

    if (!this.paused) {
      this.position += (now - this.lastTick) / 1000;
    }

    this.lastTick = now;

    if (this.position >= this.duration) {
      this.finish(0);
    }
  }

  setPaused(value) {
    this.tick();
    this.paused = value;
  }

  finish(code) {
    if (this.finished) return;

    this.finished = true;
    clearInterval(this.timer);
    this.emit("close", code);
  }

  kill() {
    this.finish(null);
  }
}

// The player for the song currently "playing", so commands and
// position queries have something to talk to.
let activePlayer = null;

function durationFor(title) {
  return FIXED_SECONDS || 20 + (hashNumber(title) % 21);
}

function spawnPlayer(item) {
  const player = new FakePlayer(durationFor(item.title));

  activePlayer = player;

  player.on("close", () => {
    if (activePlayer === player) activePlayer = null;
  });

  return player;
}

// Only pause matters here — there's no audio, so volume has nothing to do.
function sendCommand(commandArr) {
  const [cmd, prop, value] = commandArr;

  if (cmd === "set_property" && prop === "pause" && activePlayer) {
    activePlayer.setPaused(Boolean(value));
  }
}

function queryProperties(properties) {
  const result = {};

  if (!activePlayer) {
    return Promise.resolve(result);
  }

  const values = {
    "time-pos": activePlayer.position,
    duration: activePlayer.duration,
    "core-idle": activePlayer.paused,
    "paused-for-cache": false,
  };

  properties.forEach((prop) => {
    if (prop in values) result[prop] = values[prop];
  });

  return Promise.resolve(result);
}

// A coloured square with the song's first letter, drawn as an inline
// SVG, so thumbnails work with no network.
function fakeThumbnail(seed) {
  const hue = hashNumber(seed) % 360;
  const letter = (seed.match(/[A-Za-z0-9]/) || ["♪"])[0].toUpperCase();

  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320' viewBox='0 0 320 320'>` +
    `<rect width='320' height='320' fill='hsl(${hue},70%,55%)'/>` +
    `<circle cx='160' cy='160' r='95' fill='hsl(${(hue + 40) % 360},70%,38%)'/>` +
    `<text x='160' y='205' font-size='120' font-weight='bold' text-anchor='middle' ` +
    `font-family='sans-serif' fill='white'>${letter}</text></svg>`;

  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

function lookup(input, { signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const trimmed = input.trim();

    // Pretend the lookup takes a moment, like the real one.
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", cancel);
      // Anything starting with "fail" lets you test the error toast.
      if (/^fail/i.test(trimmed)) {
        reject(new Error("No YouTube result found (fake)"));
        return;
      }

      const id =
        extractYouTubeId(trimmed) ||
        crypto
          .createHash("md5")
          .update(trimmed)
          .digest("base64url")
          .slice(0, 11);

      const title = isYouTubeUrl(trimmed)
        ? `Fake video ${id}`
        : `Fake: ${trimmed}`;

      resolve({
        title,
        url: `https://www.youtube.com/watch?v=${id}`,
        thumbnail: fakeThumbnail(title),
      });
    }, 400);
    const cancel = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal?.addEventListener("abort", cancel, { once: true });
  });
}

const bar = "=".repeat(66);

module.exports = {
  name: "fake",

  banner: [
    bar,
    " DEV FAKE MODE — simulated songs, NO AUDIO, no mpv / yt-dlp needed",
    bar,
    `  Songs last ${FIXED_SECONDS || "20-40"}s (set DEV_FAKE_SECONDS to change it).`,
    '  Add a song starting with "fail" to test the error path.',
    `  Queue is saved to ${path.basename(QUEUE_FILE)}, separate from the real queue.json.`,
    "  To run for real: start without DEV_FAKE (e.g. `npm start`).",
    bar,
  ],

  lookup,
  spawnPlayer,
  sendCommand,
  queryProperties,

  // Lets the page show a "FAKE MODE" badge so it's never mistaken for
  // the real thing.
  stateExtras: () => ({ devFake: true }),
};
