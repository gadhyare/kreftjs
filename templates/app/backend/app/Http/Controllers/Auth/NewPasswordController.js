const { DB, Hash, ValidationError, same } = require('kreftjs/server')
const User = require('../../../Models/User')
const PersonalAccessToken = require('../../../Models/PersonalAccessToken')

const MINUTES = 60 // how long a reset link works

class NewPasswordController {
  // POST /api/reset-password   (pages/auth/ResetPassword.kreftjs)
  async store(req) {
    const data = await req.validate({
      token: 'required',
      email: 'required|email',
      password: 'required|min:8|confirmed',
    })
    const email = data.email.toLowerCase()
    const row = await DB.table('password_reset_tokens').where('email', email).first()
    const madeAt = row && new Date(String(row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at).replace(' ', 'T').replace(/(T[\d:]+)$/, '$1Z'))
    const user = row && await User.where('email', email).first()
    if (!row || !user || !same(String(row.token || ''), Hash.sha256(data.token)) || Date.now() - madeAt.getTime() > MINUTES * 60000) {
      throw new ValidationError({ email: ['This password reset link is not valid any more. Ask for a new one.'] })
    }
    await user.update({ password: Hash.make(data.password) })
    await DB.table('password_reset_tokens').where('email', email).delete()
    await PersonalAccessToken.where('user_id', user.id).delete() // signed out everywhere
    return { message: 'Your password has been reset. Log in with the new one.' }
  }
}

module.exports = NewPasswordController
