// THE switch between real playback and dev fake mode.
//
// This is the only file outside src/dev/ that knows fake mode exists.
// With DEV_FAKE off (the default) src/dev/ is never even loaded, so
// you can delete that folder for production and nothing changes.

const config = require('../config');

function load() {
  if (!config.DEV_FAKE) {
    return require('./real');
  }

  try {
    return require('../dev/fake-backend');
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND' && /fake-backend/.test(err.message)) {
      console.error('DEV_FAKE is on, but src/dev/ is missing. Unset DEV_FAKE.');
      process.exit(1);
    }

    throw err;
  }
}

module.exports = load();
