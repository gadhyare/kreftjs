const { noContent, abort } = require('somjs/server')
const PersonalAccessToken = require('../../../Models/PersonalAccessToken')

// The devices signed in to this account (pages/Profile.som → Browser sessions)
class SessionController {
  // GET /api/user/sessions
  async index(req) {
    const rows = await PersonalAccessToken.where('user_id', req.user.id).where('type', 'session').orderByDesc('last_used_at').get()
    return rows.map((t) => ({ id: t.id, name: t.name, ip_address: t.ip_address, last_used_at: t.last_used_at || t.created_at, current: t.id === req.accessToken.id }))
  }

  // DELETE /api/user/sessions/{id}: log that device out
  async destroy(req, id) {
    const token = await PersonalAccessToken.where('user_id', req.user.id).where('type', 'session').find(id)
    if (!token) abort(404, 'That session is gone already.')
    await token.delete()
    return noContent()
  }

  // DELETE /api/user/sessions   ('password.confirm'): every other device
  async destroyOthers(req) {
    await PersonalAccessToken.where('user_id', req.user.id).where('type', 'session').where('id', '!=', req.accessToken.id).delete()
    return noContent()
  }
}

module.exports = SessionController
