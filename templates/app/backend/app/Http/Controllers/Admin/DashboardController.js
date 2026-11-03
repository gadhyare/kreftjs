const User = require('../../../Models/User')
const PersonalAccessToken = require('../../../Models/PersonalAccessToken')

// GET /api/admin/stats   (frontend/pages/Dashboard.kreft)
class DashboardController {
  async index(req) {
    if (!req.user || !req.user.is_admin) {
      return {
        users: 1,
        admins: 0,
        unverified: req.user && !req.user.email_verified_at ? 1 : 0,
        newThisWeek: 0,
        signedIn: req.user ? await PersonalAccessToken.where('user_id', req.user.id).count() : 0,
        latest: req.user ? [req.user] : [],
      }
    }
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 19).replace('T', ' ')
    return {
      users: await User.count(),
      admins: await User.where('is_admin', true).count(),
      unverified: await User.query().whereNull('email_verified_at').count(),
      newThisWeek: await User.where('created_at', '>=', weekAgo).count(),
      signedIn: await PersonalAccessToken.count(),
      latest: await User.latest('id').limit(5).get(),
    }
  }

  // GET /api/admin/me   (frontend/pages/Profile.kreft)
  async me(req) {
    return { user: req.user, devices: await PersonalAccessToken.where('user_id', req.user.id).count() }
  }
}

module.exports = DashboardController
