// Adding songs to the queue and taking them out again.

const express = require("express");
const { lookup } = require("../lookup");
const { state, nextId, save } = require("../state");
const abuseGuard = require("../abuseGuard");
const { playNext } = require("../player");
const { getIp } = require("../util");

const router = express.Router();

router.post("/queue", async (req, res) => {
  const { input, addedBy } = req.body || {};

  if (typeof input !== "string" || !input.trim() || input.length > 1000) {
    return res.status(400).json({
      error: "Song input is required and must be text, at most 1000 characters",
    });
  }
  if (
    addedBy !== undefined &&
    (typeof addedBy !== "string" || addedBy.length > 80)
  ) {
    return res
      .status(400)
      .json({ error: "Name must be text, at most 80 characters" });
  }

  const ip = getIp(req);
  const now = Date.now();

  const blocked = abuseGuard.reserveLookup(ip, now);

  if (blocked) {
    return res.status(429).json({ error: blocked });
  }

  const originalInput = input.trim();

  let meta;
  const controller = new AbortController();
  const cancel = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.on("close", cancel);

  try {
    console.log(`Looking up on YouTube: ${originalInput}`);

    meta = await lookup(originalInput, controller.signal);
    if (controller.signal.aborted) return;

    console.log(`YouTube result: ${meta.title} (${meta.url})`);
  } catch (err) {
    if (controller.signal.aborted) return;
    console.error("YouTube lookup failed:", err.message);

    return res
      .status(
        err.code === "LOOKUP_CANCELLED"
          ? 409
          : err.code === "LOOKUP_TIMEOUT"
            ? 504
            : err.code === "YTDLP_NOT_FOUND" || err.code === "YOUTUBE_BACKOFF"
              ? 503
              : 500,
      )
      .json({
        error:
          err.code === "YTDLP_NOT_FOUND" ||
          err.code === "LOOKUP_CANCELLED" ||
          err.code === "YOUTUBE_BACKOFF"
            ? err.message
            : err.code === "LOOKUP_TIMEOUT"
              ? err.message
              : "Could not find that song on YouTube",
      });
  } finally {
    abuseGuard.releaseLookup(ip);
    res.removeListener("close", cancel);
  }

  const item = {
    id: nextId(),
    title: meta.title,
    requestedAs: originalInput, // what the user actually typed
    target: meta.url,
    thumbnail: meta.thumbnail,
    addedBy: addedBy?.trim() || "SOMEONE",
    addedAt: Date.now(),
  };

  state.queue.push(item);
  abuseGuard.recordAdd(ip, item.id, Date.now());

  save();

  playNext();

  res.json({ ok: true, item });
});

router.delete("/queue/:id", (req, res) => {
  const id = Number(req.params.id);

  state.queue = state.queue.filter((s) => s.id !== id);
  abuseGuard.forgetItem(id);

  save();

  res.json({ ok: true });
});

module.exports = router;
