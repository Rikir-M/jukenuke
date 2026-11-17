// Fetches /api/state and redraws everything from it. Runs once a
// moment while the tab is visible, and straight after any action.

let stateRequest = null;
let refreshAgain = false;
let sessionEnded = false;

function refresh() {
  if (sessionEnded) return Promise.resolve();
  refreshAgain = true;
  if (stateRequest) return stateRequest;
  stateRequest = (async () => {
    do {
      refreshAgain = false;
      await refreshState();
    } while (refreshAgain && !document.hidden && !sessionEnded);
  })().finally(() => {
    stateRequest = null;
  });
  return stateRequest;
}

async function refreshState() {
  try {
    const res = await apiFetch("/api/state");
    if (!res.ok) throw new Error("State unavailable");
    const data = await res.json();
    if (sessionEnded || document.hidden) return;
    if (
      !Array.isArray(data.queue) ||
      typeof data.paused !== "boolean" ||
      typeof data.volume !== "number"
    )
      throw new Error("Invalid state");

    serverReachable = true;
    document.getElementById("connection-status").hidden = true;
    document.getElementById("storage-status").hidden = !data.persistenceError;

    syncVolume(data);
    syncPauseButton(data);
    renderReactions(data.current);
    renderNowPlaying(data);
    renderQueue(data);
    showDevBadge(data);
  } catch (e) {
    serverReachable = false;
    if (sessionEnded) return;
    clearInterval(trackTimer);
    document.getElementById("connection-status").hidden = false;
    onAir.classList.remove("live");
    onAirText.textContent = "OFFLINE";

    // The phone may briefly be asleep or off WiFi.
    // Try again on the next poll.
  }
}

/* Polling — only while the tab is visible */

const POLL_INTERVAL_MS = 2500;
let pollTimer = null;

function startPolling() {
  if (pollTimer || sessionEnded) return;

  refresh();
  pollTimer = setInterval(refresh, POLL_INTERVAL_MS);
}

function stopPolling() {
  clearInterval(pollTimer);
  pollTimer = null;

  clearInterval(trackTimer);
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopPolling();
  } else {
    startPolling();
  }
});
