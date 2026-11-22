// Shared metadata only: playback URLs are still resolved by mpv when needed.
function createLookupPolicy(
  fetch,
  {
    keyFor = (input) => input.trim(),
    now = Date.now,
    ttlMs = 6 * 60 * 60 * 1000,
    maxEntries = 500,
    concurrency = 1,
    backoffMs = 60 * 1000,
    maxBackoffMs = 15 * 60 * 1000,
  } = {},
) {
  const cache = new Map();
  const pending = new Map();
  const queue = [];
  let active = 0;
  let blockedUntil = 0;
  let strikes = 0;

  function cooldownError() {
    return Object.assign(
      new Error(
        `YouTube is limiting requests. Please try again in ${Math.max(1, Math.ceil((blockedUntil - now()) / 1000))} seconds.`,
      ),
      { code: "YOUTUBE_BACKOFF" },
    );
  }

  function pump() {
    while (active < concurrency && queue.length) {
      const job = queue.shift();
      if (job.controller.signal.aborted) continue;
      active++;
      (async () => {
        try {
          if (now() < blockedUntil) throw cooldownError();
          const result = await fetch(job.input, {
            signal: job.controller.signal,
          });
          job.controller.signal.throwIfAborted();
          strikes = 0;
          cache.delete(job.key);
          cache.set(job.key, { result: { ...result }, expires: now() + ttlMs });
          while (cache.size > maxEntries)
            cache.delete(cache.keys().next().value);
          job.resolve(result);
        } catch (error) {
          if (
            !job.controller.signal.aborted &&
            /sign in to confirm|not a bot|too many requests|HTTP Error 429|request rate limit|This content isn.t available, try again later/i.test(
              error.message,
            )
          ) {
            blockedUntil =
              now() +
              Math.min(maxBackoffMs, backoffMs * 2 ** Math.min(strikes++, 20));
            job.reject(cooldownError());
          } else job.reject(error);
        } finally {
          if (pending.get(job.key) === job) pending.delete(job.key);
          active--;
          pump();
        }
      })();
    }
  }

  function lookup(input, { signal } = {}) {
    if (signal?.aborted) return Promise.reject(signal.reason);
    const key = keyFor(input);
    const cached = cache.get(key);
    if (cached && cached.expires > now())
      return Promise.resolve({ ...cached.result });
    cache.delete(key);
    if (now() < blockedUntil) return Promise.reject(cooldownError());
    let job = pending.get(key);
    if (!job) {
      job = { key, input, controller: new AbortController(), users: 0 };
      job.promise = new Promise((resolve, reject) => {
        job.resolve = resolve;
        job.reject = reject;
      });
      pending.set(key, job);
      queue.push(job);
    }
    job.users++;
    const current = job;
    return new Promise((resolve, reject) => {
      let finished = false;
      function finish(error, result) {
        if (finished) return;
        finished = true;
        signal?.removeEventListener("abort", cancel);
        current.users--;
        if (!current.users && pending.get(key) === current) {
          pending.delete(key);
          current.controller.abort();
          const index = queue.indexOf(current);
          if (index !== -1) queue.splice(index, 1);
        }
        if (error) reject(error);
        else resolve({ ...result });
      }
      const cancel = () => finish(signal.reason);
      signal?.addEventListener("abort", cancel, { once: true });
      current.promise.then(
        (result) => finish(null, result),
        (error) => finish(error),
      );
      pump();
    });
  }

  return lookup;
}

module.exports = { createLookupPolicy };
