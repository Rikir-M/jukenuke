// Fetches /api/state and redraws everything from it. Runs once a
// moment while the tab is visible, and straight after any action.

async function refresh() {
    try {
        const res = await fetch("/api/state");
        const data = await res.json();

        serverReachable = true;

        syncVolume(data);
        syncPauseButton(data);
        renderReactions(data.current);
        renderNowPlaying(data);
        renderQueue(data);
        showDevBadge(data);
    } catch (e) {
        serverReachable = false;

        // The phone may briefly be asleep or off WiFi.
        // Try again on the next poll.
    }
}

/* Polling — only while the tab is visible */

const POLL_INTERVAL_MS = 2500;
let pollTimer = null;

function startPolling() {
    if (pollTimer) return;

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
