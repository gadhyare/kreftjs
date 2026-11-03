const { Crypt, TOTP, QR, ValidationError, abort, noContent } = require('kreftjs/server')

// Two-factor authentication with an authenticator app (pages/Profile.kreftjs → Two-factor authentication)
class TwoFactorController {
  ensureSession(req) {
    if (req.accessToken && req.accessToken.type !== 'session' && !req.accessToken.can('*')) {
      abort(403, 'Two-factor authentication management requires a browser session.')
    }
  }

  // POST /api/user/two-factor   ('password.confirm'): a new secret, not on yet → scan the QR code, then confirm
  async enable(req) {
    this.ensureSession(req)
    const user = req.user
    if (user.hasTwoFactor()) abort(409, 'Two-factor authentication is already on.')
    const secret = TOTP.secret()
    user.two_factor_secret = Crypt.encryptString(secret)
    user.two_factor_recovery_codes = Crypt.encrypt(TOTP.recoveryCodes())
    user.two_factor_confirmed_at = null
    await user.save()
    const url = TOTP.url(secret, user.email)
    return { secret, url, qr: QR.svg(url, { size: 192 }) }
  }

  // POST /api/user/two-factor/confirm  { code }: the first code from the app turns it on
  async confirm(req) {
    this.ensureSession(req)
    const { code } = await req.validate({ code: 'required' })
    const user = req.user
    if (!user.two_factor_secret) abort(409, 'Start two-factor authentication first.')
    if (!TOTP.verify(user.twoFactorSecret() || '', code)) throw new ValidationError({ code: ['The code is not right. Use the newest code from the app.'] })
    user.two_factor_confirmed_at = new Date()
    await user.save()
    return { enabled: true, recovery_codes: user.recoveryCodes() }
  }

  // DELETE /api/user/two-factor   ('password.confirm')
  async disable(req) {
    this.ensureSession(req)
    const user = req.user
    user.two_factor_secret = null
    user.two_factor_recovery_codes = null
    user.two_factor_confirmed_at = null
    await user.save()
    return noContent()
  }

  // GET /api/user/two-factor/recovery-codes   ('password.confirm')
  async recoveryCodes(req) {
    this.ensureSession(req)
    return { recovery_codes: req.user.recoveryCodes() }
  }

  // POST /api/user/two-factor/recovery-codes   ('password.confirm'): new ones; the old ones stop working
  async regenerate(req) {
    this.ensureSession(req)
    req.user.two_factor_recovery_codes = Crypt.encrypt(TOTP.recoveryCodes())
    await req.user.save()
    return { recovery_codes: req.user.recoveryCodes() }
  }
}

module.exports = TwoFactorController
