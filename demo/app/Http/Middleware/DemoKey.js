const { abort } = require('kreftjs/server')

// 'demo-key' in routes/api.js: the request must send  X-Demo-Key: kreftjs
class DemoKey {
  async handle(req, next) {
    if (req.header('x-demo-key') !== 'kreftjs') abort(403, 'Send the header X-Demo-Key: kreftjs to delete.')
    const response = await next(req)
    return response.header('X-Checked-By', 'DemoKey')   // after the controller
  }
}

module.exports = DemoKey
