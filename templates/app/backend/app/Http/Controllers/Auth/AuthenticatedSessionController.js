const { Hash, ValidationError, noContent } = require('somjs/server')
const User = require('../../../Models/User')
const { signIn, signOut, pendingTwoFactor } = require('../../../Auth/Session')

class AuthenticatedSessionController {
  // POST /api/login  { email, password, remember }   (pages/auth/Login.som)
  // with two-factor on, the answer is { two_factor: true } and the code goes to /api/two-factor-challenge
  async store(req) {
    const data = await req.validate({ email: 'required|string|email', password: 'required|string', remember: 'sometimes|boolean' })
    const user = await User.where('email', data.email.toLowerCase()).first()
    if (!user || !Hash.check(data.password, user.password)) {
      throw new ValidationError({ email: ['These credentials do not match our records.'] })
    }
    if (user.hasTwoFactor()) return pendingTwoFactor(req, user, req.boolean('remember'))
    return signIn(req, user, { remember: req.boolean('remember') })
  }

  // POST /api/logout: this device's login stops working
  async destroy(req) {
    await req.accessToken.delete()
    return signOut(noContent())
  }
}

module.exports = AuthenticatedSessionController
