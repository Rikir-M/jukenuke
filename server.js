// Bluetooth Jukenuke server.
// Runs on the "player" phone. Hosts the web UI + a song queue, and
// plays queued songs through mpv -> the phone's audio output
// (which Android routes to the paired Bluetooth speaker).
//
// This file only starts things up. The real work is in src/.

const config = require("./src/config");
const backend = require("./src/backend");
// const { CONTROL_PIN } = require("./src/pin");
const { createApp } = require("./src/app");
const { playNext } = require("./src/player");

createApp().listen(config.PORT, "0.0.0.0", () => {
  console.log(`Jukenuke running: http://<phone-ip>:${config.PORT}`);
  /* console.log(
        `Control PIN (needed for skip / stop music / end session): ${CONTROL_PIN}`,
    ); */

  backend.banner.forEach((line) => console.log(line));

  playNext();
});
