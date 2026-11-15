// Skip, stop and end-session buttons (all PIN protected).

/* Skip */

skipBtn.addEventListener("click", async () => {
    const ok = await callPinProtected("/api/skip");

    if (ok) {
        showToast("TRACK SKIPPED!");
        refresh();
    }
});

/* Stop */

stopBtn.addEventListener("click", async () => {
    if (!confirm("STOP THE MUSIC AND CLEAR THE SETLIST?")) {
        return;
    }

    const ok = await callPinProtected("/api/stop-music");

    if (ok) {
        showToast("MUSIC STOPPED — SETLIST CLEARED");
        refresh();
    }
});

/* Shutdown */

shutdownBtn.addEventListener("click", async () => {
    if (
        !confirm(
            "END THE JUKENUKE SESSION? THIS WILL TAKE THE PAGE OFFLINE FOR EVERYONE.",
        )
    ) {
        return;
    }

    const ok = await callPinProtected("/api/shutdown", true);

    if (ok) {
        npTitle.textContent = "SESSION ENDED";
        npEyebrow.textContent = "";
        npBy.textContent = "";

        document.querySelectorAll("button, input").forEach((el) => {
            el.disabled = true;
        });

        showToast("SESSION ENDED — RESTART FROM PHONE");
    }
});
