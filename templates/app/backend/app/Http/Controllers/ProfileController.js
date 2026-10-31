const { Hash, ValidationError, noContent } = require('somjs/server')
const PersonalAccessToken = require('../../Models/PersonalAccessToken')

// pages/Profile.som
class ProfileController {
  // GET /api/user: who is signed in
  async show(req) {
    return req.user
  }

  // PATCH /api/profile  { name, email }
  async update(req) {
    const user = req.user
    const data = await req.validate({
      name: 'required|string|max:255',
      email: `required|string|email|max:255|unique:users,email,${user.id}`,
    })
    const changed = data.email.toLowerCase() !== user.email
    user.fill({ name: data.name, email: data.email.toLowerCase() })
    if (changed) user.email_verified_at = null // a new address has to be verified again
    await user.save()
    if (changed) await user.sendEmailVerificationNotification()
    return user
  }

  // PUT /api/password  { current_password, password, password_confirmation }
  async password(req) {
    const data = await req.validate({ current_password: 'required', password: 'required|min:8|confirmed' })
    if (!Hash.check(data.current_password, req.user.password)) {
      throw new ValidationError({ current_password: ['The password is incorrect.'] })
    }
    await req.user.update({ password: Hash.make(data.password) })
    // other browsers have to log in again with the new password
    await PersonalAccessToken.where('user_id', req.user.id).where('type', 'session').where('id', '!=', req.accessToken.id).delete()
    return { message: 'Password updated.' }
  }

  // DELETE /api/profile   ('password.confirm': the password was typed again in the last 3 hours)
  async destroy(req) {
    await PersonalAccessToken.where('user_id', req.user.id).delete()
    await req.user.delete()
    return require('../../Auth/Session').signOut(noContent())
  }
}

module.exports = ProfileController
