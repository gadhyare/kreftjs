// 'admin' in the routes (after 'auth'): only users with is_admin get through.
const { abort } = require('somjs/server')

class EnsureIsAdmin {
  async handle(req, next) {
    if (!req.user || !req.user.is_admin) abort(403, 'Only for admins.')
    return next(req)
  }
}

module.exports = EnsureIsAdmin
