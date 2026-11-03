// 'ability:posts:write,admin' in the routes (after 'auth'): the API token has at least one of them
const { abort } = require('kreft/server')

class CheckForAnyAbility {
  async handle(req, next, ...abilities) {
    if (!req.accessToken) abort(401, 'Unauthenticated.')
    if (!abilities.some((a) => req.accessToken.can(a))) abort(403, 'This token is not allowed to do that.')
    return next(req)
  }
}

module.exports = CheckForAnyAbility
