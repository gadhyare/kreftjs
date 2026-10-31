const { TOTP, ValidationError, abort } = require('somjs/server')
const User = require('../../../Models/User')
const { signIn, readPendingTwoFactor } = require('../../../Auth/Session')

class TwoFactorChallengeController {
  // POST /api/two-factor-challenge  { code } or { recovery_code }   (after /api/login said two_factor: true)
  async store(req) {
    const pending = readPendingTwoFactor(req)
    if (!pending) abort(419, 'The login took too long. Log in again.')
    const user = await User.find(pending.id)
    if (!user || !user.hasTwoFactor()) abort(419, 'The login took too long. Log in again.')

    const code = req.string('code').trim()
    const recovery = req.string('recovery_code').trim()
    if (recovery) {
      if (!user.recoveryCodes().includes(recovery)) throw new ValidationError({ recovery_code: ['That recovery code is not right, or was used already.'] })
      await user.replaceRecoveryCode(recovery) // each one works once
    } else if (!TOTP.verify(user.twoFactorSecret() || '', code)) {
      throw new ValidationError({ code: ['The code is not right. Use the newest code from the app.'] })
    }
    return (await signIn(req, user, { remember: pending.remember })).withoutCookie('som_2fa')
  }
}

module.exports = TwoFactorChallengeController
