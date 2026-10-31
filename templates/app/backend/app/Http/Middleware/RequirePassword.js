// 'password.confirm' in the routes: the user typed their password again in the last 3 hours
// (pages/auth/ConfirmPassword.som). Otherwise the answer is 423 and the app asks for it.
const { abort } = require('somjs/server')

const TIMEOUT = Number(process.env.PASSWORD_TIMEOUT || 10800) // seconds

class RequirePassword {
  async handle(req, next) {
    const at = req.accessToken && req.accessToken.password_confirmed_at
    if (!at || Date.now() - new Date(at).getTime() > TIMEOUT * 1000) abort(423, 'Password confirmation required.')
    return next(req)
  }
}

module.exports = RequirePassword
