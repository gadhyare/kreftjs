const { Model, Hash, Str, Mail, Url, Crypt } = require('kreft/server')
const PersonalAccessToken = require('./PersonalAccessToken')

// The users table. The password is stored as a hash (Hash.make) and never sent to the browser.
class User extends Model {
  static fillable = ['name', 'email', 'password']
  static hidden = ['password', 'two_factor_secret', 'two_factor_recovery_codes']
  static casts = { email_verified_at: 'datetime', is_admin: 'boolean', two_factor_confirmed_at: 'datetime' }
  static appends = ['two_factor_enabled']

  tokens() { return this.hasMany(PersonalAccessToken) }

  // a new sign-in or API token: the client keeps "5|k3J9…", the table keeps only a hash of it
  async createToken(name = 'browser', { type = 'api', abilities = ['*'], ip = null, userAgent = null, remember = false, expiresAt = null } = {}) {
    const plain = Str.random(40)
    const token = await PersonalAccessToken.create({
      user_id: this.id, type, name: String(name).slice(0, 255), token: Hash.sha256(plain), abilities,
      ip_address: ip, user_agent: userAgent ? String(userAgent).slice(0, 255) : null, remember, expires_at: expiresAt,
    })
    return { accessToken: token, plainTextToken: token.id + '|' + plain }
  }

  // roles: 'user' by default; user.hasRole('editor', 'admin') — and 'role:editor,admin' in the routes
  hasRole(...roles) { return this.is_admin || roles.flat().includes(this.role) }

  // two-factor: an authenticator app code is asked after the password
  getTwoFactorEnabledAttribute() { return Boolean(this.two_factor_secret && this.two_factor_confirmed_at) }
  hasTwoFactor() { return Boolean(this.two_factor_secret && this.two_factor_confirmed_at) }
  twoFactorSecret() { return this.two_factor_secret ? Crypt.decryptString(this.two_factor_secret) : null }
  recoveryCodes() { return this.two_factor_recovery_codes ? Crypt.decrypt(this.two_factor_recovery_codes) : [] }
  async replaceRecoveryCode(code) {
    this.two_factor_recovery_codes = Crypt.encrypt(this.recoveryCodes().filter((c) => c !== code))
    await this.save()
  }

  hasVerifiedEmail() { return Boolean(this.email_verified_at) }

  async markEmailAsVerified() {
    this.email_verified_at = new Date()
    return this.save()
  }

  // the "Verify your email" email: a link that works for 60 minutes
  async sendEmailVerificationNotification() {
    const link = Url.to(Url.signed(`/verify-email/${this.id}/${Hash.sha256(this.email)}`, 60))
    await Mail.send({
      to: this.email,
      subject: 'Verify your email address',
      text: `Hello ${this.name},\n\nOpen this link to verify your email address:\n${link}\n\nThe link works for 60 minutes. If you did not make an account, you can ignore this email.`,
    })
  }

  // the "Reset your password" email
  async sendPasswordResetNotification(token) {
    const link = Url.to(`/reset-password/${token}?email=${encodeURIComponent(this.email)}`)
    await Mail.send({
      to: this.email,
      subject: 'Reset your password',
      text: `Hello ${this.name},\n\nSomeone asked to reset the password for this account. Open this link to choose a new one:\n${link}\n\nThe link works for 60 minutes. If it wasn't you, you can ignore this email.`,
    })
  }
}

module.exports = User
