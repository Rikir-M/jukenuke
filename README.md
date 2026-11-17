# JukeNuke

A Bluetooth jukebox. One device (the "player" — a spare phone or a PC) runs
this server and plays music through its speaker; everyone else opens the page
in their browser, queues songs from YouTube, and reacts to what's playing.

## Quick start

You need **Node.js 20+**, plus **mpv** and **yt-dlp** installed and on your
PATH (they do the playing and the YouTube lookups).

`npm install` installs JavaScript dependencies only. Install mpv and yt-dlp
separately. Confirm both `mpv --version` and `yt-dlp --version` work in the
terminal where you start the server. After changing PATH on Windows, open a
new terminal.

```
npm install
npm start
```

Then open `http://<that-device's-ip>:3000`. PIN protection is temporarily disabled: skip, stop, and end session work
without a PIN. The original verification and browser prompt code are retained
in comments in `src/pin.js` and `public/js/pin.js`.

On a phone (Termux): `pkg install nodejs mpv yt-dlp`, then
`npm install --omit=dev` and `npm start`.

The player device produces the audio; joining from another browser does not
play audio on that browser's device. Pair the player with your Bluetooth
speaker using the operating system's Bluetooth settings.

**Use on trusted Wi-Fi only.** This app is not hardened for public internet
access. See [SECURITY.md](SECURITY.md) for its access controls and limitations.

## Try it without audio dependencies

```sh
npm ci
npm run dev:fake
```

Open `http://localhost:3000`. This lets you try the interface, queue, reactions
and searching animation without installing mpv or yt-dlp. Songs are simulated;
there is no audio. On Windows PowerShell, use `npm.cmd` if execution policy
blocks `npm.ps1`.

## Working on it

| Command            | What it does                                                    |
| ------------------ | --------------------------------------------------------------- |
| `npm run dev`      | Server that restarts when you save a server file                |
| `npm run dev:fake` | Same, in **fake mode** — no mpv/yt-dlp, no audio (see below)    |
| `npm run reload`   | Optional: reloads the browser when you save a file in `public/` |
| `npm test`         | Runs the tests (they use fake mode, so they need no mpv/yt-dlp) |

Without `npm run reload` just refresh the page — the server reads `public/`
fresh every time. With it, open `http://localhost:3001` instead of 3000.

To test the mobile layout without copying files, connect your phone to the
same Wi-Fi and open `http://<computer-ip>:3000`. Find the computer's Wi-Fi IPv4
address with `ipconfig` on Windows. If prompted, allow Node.js through the
firewall on your private network. With `npm run reload` running in a second
terminal, open port `3001` on the phone for automatic frontend reloads.

### Updating an Android player

Once you have a Git remote, clone the repository into Termux once. For later
updates, stop the server with Ctrl+C, run `git pull --ff-only` in its project
folder, then `npm ci --omit=dev` and `npm start`. The ignored `data/` folder stays
on the player. Never copy Windows `node_modules/` to Android.

For manual transfers, copy `server.js`, `package.json`, `package-lock.json`,
`src/` and `public/`, then install dependencies on the phone. The standalone
animation experiments and Python helper are not required by the app.

## Project layout

```
server.js            Starts the server. Nothing else lives here.
src/
  config.js          Every setting and env var, in one place
  app.js             Builds the Express app (JSON, static files, /api)
  state.js           Queue + history (saved to disk) and what's playing now
  player.js          Plays the next song; pause, skip, volume, stop
  reactions.js       The reaction emojis and who voted
  abuseGuard.js      Cooldown and per-person queue limit
  pin.js             The control PIN
  util.js            Small shared helpers
  routes/            The /api endpoints (state, queue, reactions, playback)
  backend/           How songs are found and played
    index.js         THE switch between real and fake — see below
    real.js          The real backend (ties youtube.js + mpv.js together)
    youtube.js       Song lookups with yt-dlp
    mpv.js           Playing with mpv, and talking to it
  dev/
    fake-backend.js  ALL of fake mode. Only loaded when DEV_FAKE is on.
public/              The web page — plain files, no build step
  index.html         The markup
  css/               One file per part of the page (loaded in this order)
  js/                One file per feature (order matters — see index.html)
test/                API tests and page tests
data/                Created on first run: the saved queue (git-ignored)
```

## Fake mode

Songs are "looked up" and "played" on a timer with no audio, so you can work on
the page without mpv, yt-dlp or a speaker.

- **On:** `npm run dev:fake`, or `DEV_FAKE=1 node server.js`, or `node server.js --fake`
- **Off:** just don't pass any of those. It is **off by default**.
- It is loud on purpose: a banner in the terminal and a yellow
  "DEV FAKE MODE · NO AUDIO" badge on the page.
- It saves to `data/queue.fake.json`, never your real `queue.json`.
- Type a song starting with `fail` to test the error message.
- `DEV_FAKE_SECONDS=8` makes every song 8 seconds long (default 20–40).

**For production:** run without `DEV_FAKE`. As extra insurance, if `NODE_ENV` is
`production` and `DEV_FAKE` is also set, the server refuses to start. All the
server-side fake code is in `src/dev/`, and nothing loads it unless fake mode is
on — you can delete that folder from a production install.

## Settings

Song lookups have a 30-second deadline, with one active lookup per IP and
four across the server. Use **Cancel search** or Escape to stop waiting;
the request stays in the form so you can retry. If the connection drops, a
banner appears until polling reconnects. Song inputs accept up to 1,000
characters and names up to 80.

Queue saves replace the file atomically. Invalid saved data is preserved
beside the queue file with an `.invalid-<timestamp>` suffix before starting
with an empty queue.

Set these variables in the shell before starting the server. The app does not
automatically load `.env` files. Never commit your real configuration or PIN.

| Variable                   | Default         | What it does                                 |
| -------------------------- | --------------- | -------------------------------------------- |
| `PORT`                     | `3000`          | Port to listen on                            |
| `JUKENUKE_PIN`             | random 4 digits | Control PIN (otherwise a new one each start) |
| `JUKENUKE_DATA_DIR`        | `./data`        | Where the saved queue goes                   |
| `JUKENUKE_ADD_COOLDOWN_MS` | `8000`          | Wait between one person's song requests      |
| `DEV_FAKE` / `--fake`      | off             | Fake mode (above)                            |
| `DEV_FAKE_SECONDS`         | `20–40`         | Fake mode only: fixed song length            |

## Changing things

- **Reaction emojis:** the list in `src/reactions.js` — the page follows it.
- **A new API endpoint:** add a file in `src/routes/` and list it in `src/routes/index.js`.
- **A new piece of the page:** add `js/your-thing.js` (and `css/your-thing.css`)
  and list them in `index.html`, after the files they depend on.
- **The scan-to-join QR code** is switched off: its pieces are commented out in
  `index.html`, `css/session.css`, and kept in `js/qr.js` (which isn't loaded).

## License

[MIT](LICENSE).
