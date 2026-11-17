const backend = require("./backend");

const LOOKUP_TIMEOUT_MS = 30000;

// Bound every backend lookup, even if a backend ignores cancellation.
async function lookup(input, signal, timeoutMs = LOOKUP_TIMEOUT_MS) {
  const controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  const timer = setTimeout(
    () =>
      controller.abort(
        Object.assign(new Error("Song lookup timed out. Please try again."), {
          code: "LOOKUP_TIMEOUT",
        }),
      ),
    timeoutMs,
  );
  let onAbort;
  try {
    const aborted = new Promise((_, reject) => {
      onAbort = () => reject(controller.signal.reason);
      controller.signal.addEventListener("abort", onAbort, { once: true });
      if (controller.signal.aborted) onAbort();
    });
    return await Promise.race([
      aborted,
      Promise.resolve().then(() => {
        controller.signal.throwIfAborted();
        return backend.lookup(input, { signal: controller.signal });
      }),
    ]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
    controller.signal.removeEventListener("abort", onAbort);
  }
}

module.exports = { lookup };
