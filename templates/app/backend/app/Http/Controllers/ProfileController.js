const { Hash, ValidationError, noContent, abort } = require('kreftjs/server')
const PersonalAccessToken = require('../../Models/PersonalAccessToken')

// pages/Profile.kreft
class ProfileController {
  // GET /api/user: who is signed in
  async show(req) {
    if (req.accessToken && !req.accessToken.can('read')) abort(403, 'This token is not allowed to read profile data.')
    return req.user
  }

  // PATCH /api/profile  { name, email }
  async update(req) {
    if (req.accessToken && req.accessToken.type !== 'session' && !req.accessToken.can('update')) {
      abort(403, 'This token is not allowed to update profile data.')
    }
    const user = req.user
    const data = await req.validate({
      name: 'required|string|max:255',
      email: `required|string|email|max:255|unique:users,email,${user.id}`,
    })
    const changed = data.email.toLowerCase() !== user.email
    if (changed && req.accessToken && req.accessToken.type !== 'session' && !req.accessToken.can('*')) {
      abort(403, 'Changing the account email address requires a browser session.')
    }
    // the address is what password reset trusts: a stolen session alone must not be able to move it
    if (changed) {
      const at = req.accessToken && req.accessToken.password_confirmed_at
      if (!at || Date.now() - new Date(at).getTime() > Number(process.env.PASSWORD_TIMEOUT || 10800) * 1000) {
        abort(423, 'Password confirmation required.')
      }
    }
    user.fill({ name: data.name, email: data.email.toLowerCase() })
    if (changed) user.email_verified_at = null // a new address has to be verified again
    await user.save()
    if (changed) await user.sendEmailVerificationNotification()
    return user
  }

  // PUT /api/password  { current_password, password, password_confirmation }
  async password(req) {
    if (req.accessToken && req.accessToken.type !== 'session' && !req.accessToken.can('*')) {
      abort(403, 'Changing the account password requires a browser session.')
    }
    const data = await req.validate({ current_password: 'required|string|max:255', password: 'required|string|min:8|max:255|confirmed|not_common_password' })
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
    if (req.accessToken && req.accessToken.type !== 'session' && !req.accessToken.can('*')) {
      abort(403, 'Deleting the account requires a browser session.')
    }
    await PersonalAccessToken.where('user_id', req.user.id).delete()
    await req.user.delete()
    return require('../../Auth/Session').signOut(noContent())
  }
}

module.exports = ProfileController
