// GET /api/state — everything the page needs to draw itself. The page
// polls this.

const express = require("express");
const backend = require("../backend");
const { state, runtime } = require("../state");
const { getPlayback } = require("../player");
const reactions = require("../reactions");
const { getIp } = require("../util");

const router = express.Router();

router.get("/state", async (req, res) => {
  const { timePos, duration, playbackStatus } = await getPlayback();

  const { current, paused, volume } = runtime;
  const ip = getIp(req);

  res.json({
    current: current
      ? {
          id: current.id,
          title: current.title,
          addedBy: current.addedBy,
          thumbnail: current.thumbnail,
          timePos,
          duration,
          playbackStatus,
          loadingSeconds:
            playbackStatus === "loading"
              ? Math.floor((Date.now() - current.startedAt) / 1000)
              : 0,
          reactions: reactions.counts(current.reactionVoters),
          myReactions: reactions.madeBy(current.reactionVoters, ip),
        }
      : null,

    paused,
    volume,
    persistenceError: runtime.persistenceError,
    queue: state.queue,
    history: state.history.slice(0, 10),

    ...backend.stateExtras(),
  });
});

module.exports = router;
