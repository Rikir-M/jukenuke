// Volume slider and its speaker icon.

let isAdjustingVolume = false;
let volumeSendTimer = null;
let volumeRequest = 0;
let volumeController = null;
let volumeDrag = null;

function renderVolumeKnob() {
  volumeSlider.parentElement.style.setProperty(
    "--volume-fill",
    `${volumeSlider.value}%`,
  );
  volumeSlider.parentElement.style.setProperty(
    "--knob-angle",
    `${Number(volumeSlider.value) * 2.7 - 135}deg`,
  );
}
renderVolumeKnob();

// Track angular movement without jumping when the knob is first grabbed.
// The center has no useful angle, so ignore it rather than letting it jitter.
function pointerAngle(event, center) {
  const x = event.clientX - center.x;
  const y = event.clientY - center.y;
  return Math.hypot(x, y) < 8 ? null : (Math.atan2(x, -y) * 180) / Math.PI;
}

// Clockwise increases volume over a 270-degree sweep. Keep native keyboard controls.
volumeSlider.addEventListener("pointerdown", (event) => {
  if (document.documentElement.dataset.ui !== "tape" || event.button !== 0)
    return;
  if (volumeDrag) return;
  event.preventDefault();
  volumeSlider.focus();
  const rect = volumeSlider.getBoundingClientRect();
  const center = {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
  volumeDrag = {
    id: event.pointerId,
    center,
    angle: pointerAngle(event, center),
    value: Number(volumeSlider.value),
  };
  volumeSlider.setPointerCapture(event.pointerId);
});
volumeSlider.addEventListener("pointermove", (event) => {
  if (!volumeDrag || event.pointerId !== volumeDrag.id) return;
  const angle = pointerAngle(event, volumeDrag.center);
  if (angle === null) {
    volumeDrag.angle = null;
    return;
  }
  if (volumeDrag.angle === null) {
    volumeDrag.angle = angle;
    return;
  }
  // Unwrap the -180/180 seam so crossing the bottom never flips the volume.
  const delta = ((angle - volumeDrag.angle + 540) % 360) - 180;
  volumeDrag.angle = angle;
  volumeDrag.value = Math.max(0, Math.min(100, volumeDrag.value + delta / 2.7));
  volumeSlider.value = Math.round(volumeDrag.value);
  volumeSlider.dispatchEvent(new Event("input", { bubbles: true }));
});
for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
  volumeSlider.addEventListener(type, (event) => {
    if (!volumeDrag || event.pointerId !== volumeDrag.id) return;
    volumeDrag = null;
    if (volumeSlider.hasPointerCapture(event.pointerId))
      volumeSlider.releasePointerCapture(event.pointerId);
  });
}

/* Volume Icon */

function updateVolumeIcon(v) {
  volumeIcon.innerHTML =
    v == 0
      ? `
        <svg viewBox="0 0 24 24" fill="none">
            <path
                d="M4 10v4h4l5 4V6l-5 4H4Z"
                stroke="currentColor"
                stroke-width="2"
                stroke-linejoin="round"
            />
            <path
                d="m17 9 5 6"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
            />
            <path
                d="m22 9-5 6"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
            />
        </svg>
    `
      : v < 50
        ? `
        <svg viewBox="0 0 24 24" fill="none">
            <path
                d="M4 10v4h4l5 4V6l-5 4H4Z"
                stroke="currentColor"
                stroke-width="2"
                stroke-linejoin="round"
            />
            <path
                d="M16 10.5c.6.8.6 2.2 0 3"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
            />
        </svg>
    `
        : `
        <svg viewBox="0 0 24 24" fill="none">
            <path
                d="M4 10v4h4l5 4V6l-5 4H4Z"
                stroke="currentColor"
                stroke-width="2"
                stroke-linejoin="round"
            />
            <path
                d="M16 9c1 1 1 5 0 6"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
            />
            <path
                d="M19 6c2 2 2 10 0 12"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
            />
        </svg>
    `;
}

/* Volume */

volumeSlider.addEventListener("input", () => {
  const v = volumeSlider.value;
  renderVolumeKnob();

  volumeValue.textContent = v;
  updateVolumeIcon(v);

  isAdjustingVolume = true;
  const request = ++volumeRequest;
  volumeController?.abort();

  clearTimeout(volumeSendTimer);

  volumeSendTimer = setTimeout(async () => {
    volumeController = new AbortController();
    try {
      const res = await apiFetch("/api/volume", {
        signal: volumeController.signal,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          volume: Number(v),
        }),
      });
      if (!res.ok) throw new Error("Volume rejected");
    } catch (e) {
      if (request === volumeRequest) showToast("COULD NOT CHANGE VOLUME");
    } finally {
      if (request === volumeRequest) {
        isAdjustingVolume = false;
        refresh();
      }
    }
  }, 120);
});

// Keeps the slider in step with the server, unless it's being dragged.
function syncVolume(data) {
  if (
    !isAdjustingVolume &&
    !volumeDrag &&
    typeof data.volume === "number" &&
    Number(volumeSlider.value) !== data.volume
  ) {
    volumeSlider.value = data.volume;
    volumeValue.textContent = data.volume;
    updateVolumeIcon(data.volume);
    renderVolumeKnob();
  }
}
