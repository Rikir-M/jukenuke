// The "now spinning" panel: title, who asked, elapsed time, the disc
// art, the tonearm, the equalizer and the ON AIR badge.

platterArt.addEventListener("error", () => {
    platterArt.classList.remove("visible");
    platterArt.removeAttribute("src");
});

let trackTimer = null; // ticks the elapsed time between polls

function renderNowPlaying(data) {
    if (data.current) {
        npEyebrow.textContent = "NOW SPINNING";
        npTitle.textContent = data.current.title;

        const durationKnown =
            typeof data.current.duration === "number" &&
            data.current.duration > 0;

        npBy.innerHTML = `
    REQUESTED BY ${escapeHtml(
        data.current.addedBy || "SOMEONE",
    )}
    <span class="track-time">
        <span class="elapsed" id="elapsed">--:--</span>${
            durationKnown
                ? ` <span class="duration-sep">/</span> ${formatTime(data.current.duration)}`
                : ""
        }
    </span>
    `;

        bars.style.visibility = "visible";
        bars.classList.toggle("paused", data.paused === true);

        if (data.current.thumbnail) {
            if (
                platterArt.getAttribute("src") !==
                data.current.thumbnail
            ) {
                platterArt.src = data.current.thumbnail;
            }

            platterArt.classList.add("visible");
        } else {
            platterArt.classList.remove("visible");
            platterArt.removeAttribute("src");
        }

        platter.classList.toggle("spinning", data.paused !== true);
        tonearm.classList.add("down");

        onAir.classList.add("live");
        onAirText.textContent = "ON AIR";

        clearInterval(trackTimer);

        if (typeof data.current.timePos === "number") {
            const basePos = data.current.timePos;
            const baseAt = Date.now();
            const dur = durationKnown
                ? data.current.duration
                : null;

            // mpv is the source of truth; between polls we
            // just tick the clock forward locally so the
            // number doesn't sit frozen for 2.5s at a time.
            const tick = () => {
                const el =
                    document.getElementById("elapsed");

                if (!el) return;

                let pos = data.paused
                    ? basePos
                    : basePos + (Date.now() - baseAt) / 1000;

                if (dur) pos = Math.min(pos, dur);

                el.textContent = formatTime(pos);
            };

            tick();

            if (!data.paused && !document.hidden) {
                trackTimer = setInterval(tick, 1000);
            }
        }
    } else {
        npEyebrow.textContent = "NOT SPINNING";

        npTitle.textContent = data.queue.length
            ? "UP NEXT..."
            : "QUEUE IS EMPTY";

        npBy.textContent = "";

        bars.style.visibility = "hidden";
        bars.classList.remove("paused");

        platterArt.classList.remove("visible");
        platterArt.removeAttribute("src");

        platter.classList.remove("spinning");
        tonearm.classList.remove("down");

        onAir.classList.remove("live");
        onAirText.textContent = "OFF AIR";

        clearInterval(trackTimer);
    }
}
