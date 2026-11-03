// 'verified' in the routes: the user has opened the link in the "Verify your email" email
const { abort } = require('kreft/server')

class EnsureEmailIsVerified {
  async handle(req, next) {
    if (!req.user || !req.user.hasVerifiedEmail()) abort(409, 'Your email address is not verified.')
    return next(req)
  }
}

module.exports = EnsureEmailIsVerified
