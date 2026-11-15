// Small helpers shared by the routes.

function getIp(req) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

module.exports = { getIp };
