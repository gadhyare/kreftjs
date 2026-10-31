// GET /api/time — plain Node.js: the server's clock, its Node version and how long it has been running
const os = require('os')

exports.get = () => ({
  now: new Date().toISOString(),
  node: process.version,
  platform: os.platform(),
  uptime: Math.round(process.uptime()),
})
