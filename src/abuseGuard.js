// Keeps one person from flooding the queue: a cooldown between adds,
// and a cap on how many of their songs can wait at once. Tracked by IP,
// in memory only.

const { ADD_COOLDOWN_MS, MAX_PENDING_PER_IP } = require('./config');
const { state } = require('./state');

const lastAddByIp = new Map();
const itemOwnerIp = new Map();

// Returns an error message if this IP can't add right now, else null.
function checkCanAdd(ip, now) {
  const lastAdd = lastAddByIp.get(ip) || 0;

  if (now - lastAdd < ADD_COOLDOWN_MS) {
    const waitSec = Math.ceil((ADD_COOLDOWN_MS - (now - lastAdd)) / 1000);

    return `Slow down — wait ${waitSec}s before adding another song`;
  }

  const pending = state.queue.filter((s) => itemOwnerIp.get(s.id) === ip).length;

  if (pending >= MAX_PENDING_PER_IP) {
    return `You already have ${MAX_PENDING_PER_IP} songs queued — wait for one to play`;
  }

  return null;
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

module.exports = { checkCanAdd, recordAdd, forgetItem, forgetAllQueued };
