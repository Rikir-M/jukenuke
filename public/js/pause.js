// Pause / resume button.

/* Pause / Resume Icons */

const PAUSE_ICON_SVG = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="6" y="4" width="4" height="16" rx="1"></rect>
        <rect x="14" y="4" width="4" height="16" rx="1"></rect>
    </svg>
`;

const PLAY_ICON_SVG = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 4l13 8-13 8V4Z"></path>
    </svg>
`;

function setPauseButtonState(isPaused) {
  pauseBtn.dataset.paused = isPaused ? "true" : "false";
  pauseBtnText.textContent = isPaused ? "Resume" : "Pause";
  pauseIcon.innerHTML = isPaused ? PLAY_ICON_SVG : PAUSE_ICON_SVG;
}

// Keeps the button in step with the server.
function syncPauseButton(data) {
  if (typeof data.paused === "boolean") {
    setPauseButtonState(data.paused);
  }
}

/* Pause / Resume */

pauseBtn.addEventListener("click", async () => {
  const isPaused = pauseBtn.dataset.paused === "true";
  const endpoint = isPaused ? "/api/resume" : "/api/pause";

  pauseBtn.disabled = true;

  try {
    const res = await apiFetch(endpoint, {
      method: "POST",
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      showToast(data.error || "COULD NOT DO THAT RIGHT NOW");

      return;
    }

    setPauseButtonState(data.paused);

    showToast(data.paused ? "MUSIC PAUSED!" : "MUSIC RESUMED!");

    refresh();
  } catch (e) {
    showToast("COULD NOT CONNECT TO JUKE NUKE");
  } finally {
    pauseBtn.disabled = false;
  }
});
