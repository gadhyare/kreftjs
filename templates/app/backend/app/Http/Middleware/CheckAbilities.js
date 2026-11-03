// API token abilities, like Sanctum (after 'auth'):
//   'abilities:posts:read,posts:write'  the token has all of them
//   'ability:posts:write,admin'          the token has at least one
// A browser login can do everything; only API tokens are limited.
const { abort } = require('kreftjs/server')

class CheckAbilities {
  async handle(req, next, ...abilities) {
    const token = req.accessToken
    if (!token) abort(401, 'Unauthenticated.')
    const ok = abilities.every((a) => token.can(a))
    if (!ok) abort(403, 'This token is not allowed to do that.')
    return next(req)
  }
}

module.exports = CheckAbilities
