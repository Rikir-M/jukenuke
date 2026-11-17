// The real backend: yt-dlp for lookups, mpv for playback.
//
// A backend is anything with this shape (src/dev/fake-backend.js is
// the other one):
//
//   lookup(input)            -> Promise<{ title, url, thumbnail }>
//   spawnPlayer(item, vol)   -> process-like: .stdout .stderr .kill(),
//                               emits 'close' when the song ends
//   sendCommand([...])       -> Promise, resolves when mpv acknowledges;
//                               e.g. ['set_property','pause',true]
//   queryProperties([...])   -> Promise<{ 'time-pos'?, duration? }>
//   banner                   -> lines printed at startup
//   stateExtras()            -> extra fields for GET /api/state

const youtube = require("./youtube");
const mpv = require("./mpv");

module.exports = {
  name: "real",
  banner: [],
  lookup: youtube.lookup,
  spawnPlayer: mpv.spawnPlayer,
  sendCommand: mpv.sendCommand,
  queryProperties: mpv.queryProperties,
  stateExtras: () => ({}),
};
