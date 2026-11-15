// Volume slider and its speaker icon.

let isAdjustingVolume = false;
let volumeSendTimer = null;

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

    volumeValue.textContent = v;
    updateVolumeIcon(v);

    isAdjustingVolume = true;

    clearTimeout(volumeSendTimer);

    volumeSendTimer = setTimeout(async () => {
        try {
            await fetch("/api/volume", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    volume: Number(v),
                }),
            });
        } finally {
            isAdjustingVolume = false;
        }
    }, 120);
});

// Keeps the slider in step with the server, unless it's being dragged.
function syncVolume(data) {
    if (
        !isAdjustingVolume &&
        typeof data.volume === "number" &&
        Number(volumeSlider.value) !== data.volume
    ) {
        volumeSlider.value = data.volume;
        volumeValue.textContent = data.volume;
        updateVolumeIcon(data.volume);
    }
}
