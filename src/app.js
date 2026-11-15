// Builds the Express app: JSON bodies, the web page, and the API.

const express = require('express');
const config = require('./config');

function createApp() {
  const app = express();

  app.use(express.json());
  app.use(express.static(config.PUBLIC_DIR));
  app.use('/api', require('./routes'));

  return app;
}

module.exports = { createApp };
