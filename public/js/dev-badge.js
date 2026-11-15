// Dev fake mode only. The server adds `devFake: true` to /api/state when
// it was started with DEV_FAKE, and this shows a badge so a fake session
// is never mistaken for the real thing. In production the server never
// sends it, so this does nothing.

function showDevBadge(data) {
    if (!data.devFake || document.getElementById("dev-badge")) {
        return;
    }

    const badge = document.createElement("div");

    badge.id = "dev-badge";
    badge.className = "dev-badge";
    badge.textContent = "DEV FAKE MODE · NO AUDIO";

    document.body.appendChild(badge);
}
