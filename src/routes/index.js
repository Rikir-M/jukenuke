// All the /api routes.

const express = require('express');

const router = express.Router();

router.use(require('./state'));
router.use(require('./queue'));
router.use(require('./reactions'));
router.use(require('./playback'));

module.exports = router;
