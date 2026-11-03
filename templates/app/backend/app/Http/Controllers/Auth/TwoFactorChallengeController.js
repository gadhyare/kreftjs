const { TOTP, ValidationError, abort, same } = require('kreftjs/server')
const User = require('../../../Models/User')
const Throttle = require('../../../Auth/Throttle')
const MAX_FAILURES = Number(process.env.TWO_FACTOR_MAX_FAILURES || 8)
const WINDOW_SECONDS = Number(process.env.LOGIN_WINDOW_SECONDS || 900)
const { signIn, readPendingTwoFactor, recordTwoFactorFailure, consumeTwoFactorTicket } = require('../../../Auth/Session')

class TwoFactorChallengeController {
  // POST /api/two-factor-challenge  { code } or { recovery_code }   (after /api/login said two_factor: true)
  async store(req) {
    const pending = readPendingTwoFactor(req)
    if (!pending) abort(419, 'The login took too long. Log in again.')
    const user = await User.find(pending.id)
    if (!user || !user.hasTwoFactor()) abort(419, 'The login took too long. Log in again.')

    // a new login ticket per try doesn't reset this: the failures are counted for the account
    const locked = await Throttle.wait('2fa', user.id, MAX_FAILURES)
    if (locked) abort(429, 'Too many wrong codes. Try again later.', { headers: { 'Retry-After': String(locked) } })

    const code = req.string('code').trim()
    const recovery = req.string('recovery_code').trim()
    if (recovery) {
      const matched = user.recoveryCodes().find((c) => same(String(c), recovery))
      if (!matched) {
        await Throttle.hit('2fa', user.id, WINDOW_SECONDS)
        recordTwoFactorFailure(pending)
        throw new ValidationError({ recovery_code: ['That recovery code is not right, or was used already.'] })
      }
      await user.replaceRecoveryCode(matched) // each one works once
    } else if (!TOTP.verify(user.twoFactorSecret() || '', code)) {
      await Throttle.hit('2fa', user.id, WINDOW_SECONDS)
      recordTwoFactorFailure(pending)
      throw new ValidationError({ code: ['The code is not right. Use the newest code from the app.'] })
    }
    await Throttle.clear('2fa', user.id)
    consumeTwoFactorTicket(pending)
    return (await signIn(req, user, { remember: pending.remember })).withoutCookie('kreft_2fa')
  }
}

module.exports = TwoFactorChallengeController
