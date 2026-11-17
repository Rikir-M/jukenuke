// Looks songs up on YouTube with yt-dlp.

const { spawn } = require("child_process");

const YT_URL_RE =
  /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|m\.youtube\.com)\//i;

function isYouTubeUrl(input) {
  return YT_URL_RE.test(input.trim());
}

// Matches the 11-char video id out of any common YouTube URL shape.
const YT_ID_RE =
  /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([A-Za-z0-9_-]{11})/;

function extractYouTubeId(url) {
  const match = url.match(YT_ID_RE);
  return match ? match[1] : null;
}

// YouTube serves a thumbnail at a predictable URL for any video id,
// no API key needed — used as a fallback if yt-dlp doesn't give us one.
function thumbnailForVideoId(id) {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

// Resolves user input (a YouTube URL, or a "title - artist" style
// search) into the real video's title, playable URL, and thumbnail,
// using a single yt-dlp lookup.
function lookup(input, { signal } = {}) {
  return new Promise((resolve, reject) => {
    const trimmed = input.trim();

    // A direct URL is looked up as-is; anything else is a search query.
    const arg = isYouTubeUrl(trimmed) ? trimmed : `ytsearch1:${trimmed}`;

    const yt = spawn(
      "yt-dlp",
      [
        arg,
        "--skip-download",
        "--no-playlist",

        // Title / url / thumbnail in one pass, tab separated. No
        // --flat-playlist — that skips the metadata fetch we need.
        "--print",
        "%(title)s\t%(webpage_url)s\t%(thumbnail)s",

        "--no-warnings",
      ],
      { signal, killSignal: "SIGKILL" },
    );

    let stdout = "";
    let stderr = "";

    yt.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    yt.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    yt.on("error", (err) => {
      if (err.code === "ENOENT") {
        const missing = new Error(
          "yt-dlp is not installed or is not on PATH. Install yt-dlp and mpv for real playback, or use npm run dev:fake to try simulated songs without audio.",
        );
        missing.code = "YTDLP_NOT_FOUND";
        reject(missing);
        return;
      }
      reject(new Error(`Failed to start yt-dlp: ${err.message}`));
    });

    yt.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
        return;
      }

      const line = stdout.trim().split("\n")[0] || "";
      const [rawTitle, rawUrl, rawThumbnail] = line.split("\t");

      if (!rawUrl || !/^https?:\/\/(www\.)?youtube\.com\//i.test(rawUrl)) {
        reject(new Error("No YouTube result found"));
        return;
      }

      const url = rawUrl.trim();
      const id = extractYouTubeId(url);

      const thumbnail =
        rawThumbnail && rawThumbnail.trim() && rawThumbnail.trim() !== "NA"
          ? rawThumbnail.trim()
          : id
            ? thumbnailForVideoId(id)
            : null;

      resolve({
        title: (rawTitle && rawTitle.trim()) || trimmed,
        url,
        thumbnail,
      });
    });
  });
}

module.exports = { isYouTubeUrl, extractYouTubeId, lookup };
