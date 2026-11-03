const { DB, Hash, Str } = require('kreft/server')
const User = require('../../../Models/User')

class PasswordResetLinkController {
  // POST /api/forgot-password   (pages/auth/ForgotPassword.kreft)
  async store(req) {
    const { email } = await req.validate({ email: 'required|email' })
    const user = await User.where('email', email.toLowerCase()).first()
    if (user) {
      const token = Str.random(64)
      await DB.table('password_reset_tokens').where('email', user.email).delete()
      await DB.table('password_reset_tokens').insert({ email: user.email, token: Hash.sha256(token), created_at: new Date().toISOString().slice(0, 19).replace('T', ' ') })
      await user.sendPasswordResetNotification(token)
    }
    // the same answer either way, so nobody can find out who has an account
    return { message: 'If that email address has an account, we have emailed it a link to reset the password.' }
  }
}

module.exports = PasswordResetLinkController
