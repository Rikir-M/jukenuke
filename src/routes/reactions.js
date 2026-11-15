// POST /api/react — tapping a reaction toggles your vote for that
// emoji on the song that's playing.

const express = require('express');
const { runtime } = require('../state');
const reactions = require('../reactions');
const { getIp } = require('../util');

const router = express.Router();

// The page sends the song id it saw, so a tap that lands just after the
// song changed doesn't count for the wrong song.
router.post('/react', (req, res) => {
  const { songId, emoji } = req.body || {};
  const { current } = runtime;

  if (!reactions.REACTION_EMOJIS.includes(emoji)) {
    return res.status(400).json({ error: 'unknown-reaction' });
  }

  if (!current) {
    return res.status(409).json({ error: 'nothing-playing' });
  }

  if (songId !== current.id) {
    return res.status(409).json({ error: 'song-changed' });
  }

  const ip = getIp(req);

  reactions.toggle(current.reactionVoters, emoji, ip);

  res.json({
    ok: true,
    reactions: reactions.counts(current.reactionVoters),
    myReactions: reactions.madeBy(current.reactionVoters, ip)
  });
});

module.exports = router;
