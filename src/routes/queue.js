// Adding songs to the queue and taking them out again.

const express = require('express');
const backend = require('../backend');
const { state, nextId, save } = require('../state');
const abuseGuard = require('../abuseGuard');
const { playNext } = require('../player');
const { getIp } = require('../util');

const router = express.Router();

router.post('/queue', async (req, res) => {
  const { input, addedBy } = req.body || {};

  if (!input || !input.trim()) {
    return res.status(400).json({
      error: 'input (YouTube link or "title - artist") is required'
    });
  }

  const ip = getIp(req);
  const now = Date.now();

  const blocked = abuseGuard.checkCanAdd(ip, now);

  if (blocked) {
    return res.status(429).json({ error: blocked });
  }

  const originalInput = input.trim();

  let meta;

  try {
    console.log(`Looking up on YouTube: ${originalInput}`);

    meta = await backend.lookup(originalInput);

    console.log(`YouTube result: ${meta.title} (${meta.url})`);
  } catch (err) {
    console.error('YouTube lookup failed:', err.message);

    return res.status(err.code === 'YTDLP_NOT_FOUND' ? 503 : 500).json({
      error: err.code === 'YTDLP_NOT_FOUND'
        ? err.message
        : 'Could not find that song on YouTube'
    });
  }

  const item = {
    id: nextId(),
    title: meta.title,
    requestedAs: originalInput, // what the user actually typed
    target: meta.url,
    thumbnail: meta.thumbnail,
    addedBy: (addedBy || 'someone').trim(),
    addedAt: now
  };

  state.queue.push(item);
  abuseGuard.recordAdd(ip, item.id, now);

  save();

  playNext();

  res.json({ ok: true, item });
});

router.delete('/queue/:id', (req, res) => {
  const id = Number(req.params.id);

  state.queue = state.queue.filter((s) => s.id !== id);
  abuseGuard.forgetItem(id);

  save();

  res.json({ ok: true });
});

module.exports = router;
