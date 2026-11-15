// All settings in one place. Nothing else reads process.env directly,
// except the dev-only code in src/dev/.

const path = require("path");
const os = require("os");

const ROOT = path.join(__dirname, "..");

// ---------- dev fake mode ----------
// Simulated songs and playback, no mpv/yt-dlp needed. OFF unless asked
// for with DEV_FAKE=1 or `node server.js --fake`. See src/dev/.
const DEV_FAKE =
    process.env.DEV_FAKE === "1" || process.argv.includes("--fake");

// Safety net: never run simulated playback on a real deployment.
if (DEV_FAKE && process.env.NODE_ENV === "production") {
    console.error(
        "Refusing to start: DEV_FAKE is on but NODE_ENV=production. " +
            "Unset DEV_FAKE to run the real jukenuke.",
    );
    process.exit(1);
}

const DATA_DIR = process.env.JUKENUKE_DATA_DIR || path.join(ROOT, "data");

module.exports = {
    ROOT,
    PORT: process.env.PORT || 3000,
    PUBLIC_DIR: path.join(ROOT, "public"),

    // Fake mode keeps its own queue file so pretend songs never end up
    // in the real queue.
    DATA_DIR,
    QUEUE_FILE: path.join(
        DATA_DIR,
        DEV_FAKE ? "queue.fake.json" : "queue.json",
    ),

    // mpv's IPC is a unix socket on macOS/Linux/Android, but a named
    // pipe on Windows.
    MPV_SOCKET:
        process.platform === "win32"
            ? "\\\\.\\pipe\\jukenuke-mpv"
            : path.join(os.tmpdir(), "jukenuke-mpv.sock"),

    // Abuse guards
    ADD_COOLDOWN_MS: Number(process.env.JUKENUKE_ADD_COOLDOWN_MS ?? 8000),
    MAX_PENDING_PER_IP: 4,

    HISTORY_LIMIT: 50,

    DEV_FAKE,
};
