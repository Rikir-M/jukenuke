# Contributing

Use Node.js 20 or newer. Install the locked dependencies with `npm ci`, then
start `npm run dev:fake`. Fake mode needs no mpv or yt-dlp and produces no audio.

The frontend is plain HTML, CSS and JavaScript in `public/`; there is no build
step. Server code lives in `src/`. Keep changes focused and describe how to
reproduce bugs and verify fixes.

Run `npm test` before submitting a change. The API and UI tests start local
servers in fake mode and use temporary data directories. For playback changes,
also test with mpv and yt-dlp on a real player device.

Do not commit generated data, local credentials or `node_modules/`. Include
`package-lock.json` when changing npm dependencies. Ensure you have permission
to contribute any code or artwork you include.
