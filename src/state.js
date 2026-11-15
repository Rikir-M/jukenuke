// What the server remembers.
//
//   state    queue + history, saved to disk so a restart keeps them
//   runtime  what's happening right now (never saved)

const fs = require('fs');
const path = require('path');
const config = require('./config');

function load() {
  if (fs.existsSync(config.QUEUE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(config.QUEUE_FILE, 'utf8'));
    } catch (e) {
      console.error(`Failed to parse ${path.basename(config.QUEUE_FILE)}, starting fresh`);
    }
  }

  return { queue: [], history: [] };
}

const state = load();

const runtime = {
  current: null, // { ...item, startedAt, player, reactionVoters }
  paused: false,
  volume: 80
};

let nextIdValue =
  state.queue
    .concat(state.history)
    .reduce((m, s) => Math.max(m, s.id || 0), 0) + 1;

function nextId() {
  return nextIdValue++;
}

function save() {
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
  fs.writeFileSync(config.QUEUE_FILE, JSON.stringify(state, null, 2));
}

module.exports = { state, runtime, nextId, save };
