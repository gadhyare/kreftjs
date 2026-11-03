const { abort } = require('kreft/server')

// 'demo-key' in routes/api.js: the request must send  X-Demo-Key: kreft
class DemoKey {
  async handle(req, next) {
    if (req.header('x-demo-key') !== 'kreft') abort(403, 'Send the header X-Demo-Key: kreft to delete.')
    const response = await next(req)
    return response.header('X-Checked-By', 'DemoKey')   // after the controller
  }
}

module.exports = DemoKey
