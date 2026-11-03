const { abort, noContent } = require('kreft/server')
const User = require('../../../Models/User')
const PersonalAccessToken = require('../../../Models/PersonalAccessToken')

// the roles a user can have ('role:editor' in the routes); add your own
const ROLES = ['user', 'editor']

// /api/admin/users   (frontend/pages/Users.kreft)
class UserController {
  // GET /api/admin/users?q=ali&page=2
  async index(req) {
    if (!req.user || !req.user.is_admin) abort(403, 'Only admins can view user accounts.')
    const q = req.string('q').trim()
    const safeQ = q.replace(/[%_]/g, '')
    return User.query()
      .when(safeQ, (query) => query.where((w) => w.whereLike('name', `%${safeQ}%`).orWhere('email', 'like', `%${safeQ.toLowerCase()}%`)))
      .orderByDesc('id')
      .paginate(15, req.integer('page', 1))
  }

  // PATCH /api/admin/users/{id}  { is_admin } and/or { role }
  async update(req, id) {
    if (!req.user || !req.user.is_admin) abort(403, 'Only admins can modify user roles or permissions.')
    const user = await User.findOrFail(id)
    const data = await req.validate({ is_admin: 'sometimes|boolean', role: `sometimes|in:${ROLES.join(',')}` })
    if (data.is_admin !== undefined) {
      const on = data.is_admin === true || data.is_admin === 1 || data.is_admin === '1' || data.is_admin === 'true'
      const currentId = req.user ? req.user.id : null
      if (currentId && user.id === currentId && !on) abort(422, "You can't take away your own admin rights.")
      user.is_admin = on
    }
    if (data.role !== undefined) user.role = data.role
    await user.save()
    // Session Fixation & Privilege Protection: invalidate previous sessions when privileges change
    if (data.is_admin !== undefined || data.role !== undefined) {
      await PersonalAccessToken.where('user_id', user.id).where('type', 'session').delete()
    }
    return user
  }

  // DELETE /api/admin/users/{id}
  async destroy(req, id) {
    if (!req.user || !req.user.is_admin) abort(403, 'Only admins can delete user accounts.')
    const user = await User.findOrFail(id)
    const currentId = req.user ? req.user.id : null
    if (currentId && user.id === currentId) abort(422, "You can't delete yourself here. Use your profile page.")
    await PersonalAccessToken.where('user_id', user.id).delete()
    await user.delete()
    return noContent()
  }
}

module.exports = UserController
