# YouTube lookup request policy

Real YouTube lookups share a server-wide metadata cache. Successful results stay
in memory for six hours, with a maximum of 500 entries. Restarting the server
clears the cache. Common YouTube URL forms for the same video share an entry;
searches share an entry when their text matches after trimming whitespace.

Simultaneous requests for the same input share one lookup. Distinct lookups run
one at a time. Cancelling a request only cancels the shared lookup if nobody else
is waiting for it. Existing request deadlines include time waiting for a slot.
Fake mode does not use this policy.

When yt-dlp reports a bot challenge or a recognized rate-limit error, uncached
lookups stop for one minute. Repeated challenges double that delay up to 15
minutes. A successful fresh lookup resets the delay. Requests during the cooldown
receive HTTP 503 and a message saying how long to wait. Queued requests also stop;
there are no automatic retries. Cached results remain usable during the cooldown.

This reduces metadata traffic. mpv still resolves each song for playback and its
requests do not use this metadata policy. Cached metadata therefore does not
guarantee playback when YouTube is blocking the office network.
