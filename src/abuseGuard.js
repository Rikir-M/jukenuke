// Keeps one person from flooding the queue: a cooldown between adds,
// and a cap on how many of their songs can wait at once. Tracked by IP,
// in memory only.

const { ADD_COOLDOWN_MS, MAX_PENDING_PER_IP } = require("./config");
const { state } = require("./state");

const lastAddByIp = new Map();
const itemOwnerIp = new Map();
const lookupsByIp = new Set();

// Returns an error message if this IP can't add right now, else null.
function checkCanAdd(ip, now) {
  if (lookupsByIp.has(ip)) return "A song is already being looked up for you";
  if (lookupsByIp.size >= 4)
    return "Too many song lookups. Please try again shortly";
  const lastAdd = lastAddByIp.get(ip) || 0;

  if (now - lastAdd < ADD_COOLDOWN_MS) {
    const waitSec = Math.ceil((ADD_COOLDOWN_MS - (now - lastAdd)) / 1000);

    return `Slow down — wait ${waitSec}s before adding another song`;
  }

  const pending = state.queue.filter(
    (s) => itemOwnerIp.get(s.id) === ip,
  ).length;

  if (pending >= MAX_PENDING_PER_IP) {
    return `You already have ${MAX_PENDING_PER_IP} songs queued — wait for one to play`;
  }

  return null;
}

function reserveLookup(ip, now) {
  const blocked = checkCanAdd(ip, now);
  if (blocked) return blocked;
  lookupsByIp.add(ip);
  return null;
}

function releaseLookup(ip) {
  lookupsByIp.delete(ip);
}

function recordAdd(ip, itemId, now) {
  itemOwnerIp.set(itemId, ip);
  lastAddByIp.set(ip, now);
}

function forgetItem(itemId) {
  itemOwnerIp.delete(itemId);
}

function forgetAllQueued() {
  state.queue.forEach((s) => itemOwnerIp.delete(s.id));
}

module.exports = {
  checkCanAdd,
  reserveLookup,
  releaseLookup,
  recordAdd,
  forgetItem,
  forgetAllQueued,
};
