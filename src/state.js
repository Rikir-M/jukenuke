// What the server remembers.
//
//   state    queue + history, saved to disk so a restart keeps them
//   runtime  what's happening right now (never saved)

const fs = require("fs");
const path = require("path");
const config = require("./config");

function load() {
  if (fs.existsSync(config.QUEUE_FILE)) {
    try {
      const loaded = JSON.parse(fs.readFileSync(config.QUEUE_FILE, "utf8"));
      if (
        !loaded ||
        !Array.isArray(loaded.queue) ||
        !Array.isArray(loaded.history)
      ) {
        throw new Error("Invalid saved queue structure");
      }
      const ids = new Set();
      for (const item of [...loaded.queue, ...loaded.history]) {
        if (
          !item ||
          !Number.isSafeInteger(item.id) ||
          item.id < 1 ||
          ids.has(item.id) ||
          typeof item.title !== "string" ||
          typeof item.target !== "string" ||
          !/^https?:\/\/(www\.)?youtube\.com\//i.test(item.target) ||
          (item.addedBy !== undefined && typeof item.addedBy !== "string")
        ) {
          throw new Error("Invalid saved song");
        }
        ids.add(item.id);
      }
      return {
        queue: loaded.queue,
        history: loaded.history.slice(0, config.HISTORY_LIMIT),
      };
    } catch (e) {
      console.error(
        `Invalid ${path.basename(config.QUEUE_FILE)}, preserving it and starting fresh`,
      );
      // Keep the original for recovery before startup writes an empty queue.
      fs.copyFileSync(
        config.QUEUE_FILE,
        `${config.QUEUE_FILE}.invalid-${Date.now()}`,
      );
    }
  }

  return { queue: [], history: [] };
}

const state = load();

const runtime = {
  current: null, // { ...item, startedAt, player, reactionVoters }
  paused: false,
  volume: 80,
  persistenceError: false,
};

let nextIdValue =
  state.queue
    .concat(state.history)
    .reduce((m, s) => Math.max(m, s.id || 0), 0) + 1;

function nextId() {
  return nextIdValue++;
}

function save() {
  const temporary = `${config.QUEUE_FILE}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(config.DATA_DIR, { recursive: true });
    fs.writeFileSync(temporary, JSON.stringify(state, null, 2));
    fs.renameSync(temporary, config.QUEUE_FILE);
    runtime.persistenceError = false;
    return true;
  } catch (error) {
    runtime.persistenceError = true;
    console.error("Could not save queue; continuing in memory:", error.message);
    return false;
  } finally {
    try {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    } catch (error) {
      console.error("Could not clean up temporary queue file:", error.message);
    }
  }
}

module.exports = { state, runtime, nextId, save };
