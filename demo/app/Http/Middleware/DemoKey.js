const { abort } = require('somjs/server')

// 'demo-key' in routes/api.js: the request must send  X-Demo-Key: som
class DemoKey {
  async handle(req, next) {
    if (req.header('x-demo-key') !== 'som') abort(403, 'Send the header X-Demo-Key: som to delete.')
    const response = await next(req)
    return response.header('X-Checked-By', 'DemoKey')   // after the controller
  }
}

module.exports = DemoKey
