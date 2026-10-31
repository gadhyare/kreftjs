// 'role:editor,admin' in the routes (after 'auth'): the user has one of these roles (admins have all)
const { abort } = require('somjs/server')

class EnsureHasRole {
  async handle(req, next, ...roles) {
    if (!req.user || !req.user.hasRole(roles)) abort(403, 'This action is unauthorized.')
    return next(req)
  }
}

module.exports = EnsureHasRole
