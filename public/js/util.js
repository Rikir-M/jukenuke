// Small helpers used across the page.

async function apiFetch(url, options = {}) {
  const controller = new AbortController();
  const cancel = () => controller.abort(options.signal.reason);
  options.signal?.addEventListener("abort", cancel, { once: true });
  if (options.signal?.aborted) cancel();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs || 10000,
  );
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    // Keep cancellation and the deadline active until the JSON body arrives.
    const data = await response.json();
    return { ok: response.ok, status: response.status, json: async () => data };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
  }
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 1800);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatTime(totalSeconds) {
  const secs = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(secs / 60);
  const s = String(secs % 60).padStart(2, "0");
  return `${m}:${s}`;
}
