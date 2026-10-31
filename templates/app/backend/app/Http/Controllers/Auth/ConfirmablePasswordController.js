const { Hash, ValidationError } = require('somjs/server')

class ConfirmablePasswordController {
  // POST /api/confirm-password   (pages/auth/ConfirmPassword.som): opens 'password.confirm' routes for 3 hours
  async store(req) {
    const { password } = await req.validate({ password: 'required' })
    if (!Hash.check(password, req.user.password)) throw new ValidationError({ password: ['The password is incorrect.'] })
    req.accessToken.password_confirmed_at = new Date()
    await req.accessToken.save()
    return { confirmed: true }
  }
}

module.exports = ConfirmablePasswordController
