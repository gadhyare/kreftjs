const { Hash, ValidationError, noContent, abort } = require('kreft/server')
const User = require('../../../Models/User')
const Throttle = require('../../../Auth/Throttle')

const MAX_FAILURES = Number(process.env.LOGIN_MAX_FAILURES || 10) // wrong passwords per account ...
const WINDOW_SECONDS = Number(process.env.LOGIN_WINDOW_SECONDS || 900) // ... in this many seconds
const LoginRequest = require('../../Requests/Auth/LoginRequest')
const { signIn, signOut, pendingTwoFactor } = require('../../../Auth/Session')

class AuthenticatedSessionController {
  // POST /api/login  { email, password, remember }   (pages/auth/Login.kreft)
  // with two-factor on, the answer is { two_factor: true } and the code goes to /api/two-factor-challenge
  async store(req) {
    const data = await LoginRequest.validate(req)
    const email = data.email.toLowerCase()
    // per account, whatever the address: guessing from many addresses at once stops here (known or not, same count)
    const locked = await Throttle.wait('login', email, MAX_FAILURES)
    if (locked) abort(429, 'Too many failed attempts. Try again later.', { headers: { 'Retry-After': String(locked) } })
    const user = await User.where('email', email).first()
    if (!user) {
      Hash.dummyCheck(data.password)
      await Throttle.hit('login', email, WINDOW_SECONDS)
      throw new ValidationError({ email: ['These credentials do not match our records.'] })
    }
    if (!Hash.check(data.password, user.password)) {
      await Throttle.hit('login', email, WINDOW_SECONDS)
      throw new ValidationError({ email: ['These credentials do not match our records.'] })
    }
    await Throttle.clear('login', email)
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
