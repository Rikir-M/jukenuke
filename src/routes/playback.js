// Pause, resume, volume, skip, stop and shutdown.
// Skip, stop and shutdown need the control PIN.

const express = require("express");
const player = require("../player");
const { requirePin } = require("../pin");
const { runtime } = require("../state");

const router = express.Router();

router.post("/pause", async (req, res) => {
  try {
    await player.pause();
  } catch (err) {
    return res
      .status(503)
      .json({ error: "Could not pause the player. Please try again." });
  }
  res.json({ ok: true, paused: runtime.paused });
});

router.post("/resume", async (req, res) => {
  try {
    await player.resume();
  } catch (err) {
    return res
      .status(503)
      .json({ error: "Could not resume the player. Please try again." });
  }
  res.json({ ok: true, paused: runtime.paused });
});

router.post("/volume", async (req, res) => {
  const value = Math.round(Number((req.body || {}).volume));

  if (!Number.isFinite(value)) {
    return res.status(400).json({ error: "volume must be a number 0-100" });
  }

  try {
    res.json({ ok: true, volume: await player.setVolume(value) });
  } catch (err) {
    res
      .status(503)
      .json({ error: "Could not change the player volume. Please try again." });
  }
});

router.post("/skip", requirePin, (req, res) => {
  player.skipCurrent();
  res.json({ ok: true });
});

router.post("/stop-music", requirePin, (req, res) => {
  player.clearQueueAndStop();
  res.json({ ok: true });
});

router.post("/shutdown", requirePin, (req, res) => {
  res.json({ ok: true, message: "Shutting down" });

  // Ending the session on purpose — don't carry unplayed requests
  // over to the next one.
  player.clearQueueAndStop();

  console.log("Shutdown requested from web app. Exiting in 1s...");

  setTimeout(() => process.exit(0), 1000);
});

module.exports = router;
