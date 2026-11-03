const { Hash } = require('kreftjs/server')
const User = require('../../../Models/User')
const { signIn } = require('../../../Auth/Session')

class RegisteredUserController {
  // POST /api/register   (pages/auth/Register.kreft)
  async store(req) {
    const data = await req.validate({
      name: 'required|string|max:255',
      email: 'required|string|email|max:255|unique:users,email',
      password: 'required|min:8|confirmed|not_common_password',
    })
    const user = await User.create({ name: data.name, email: data.email.toLowerCase(), password: Hash.make(data.password) })
    await user.sendEmailVerificationNotification()
    return signIn(req, user, { status: 201 })
  }
}

module.exports = RegisteredUserController
