const { noContent, abort, response } = require('somjs/server')
const PersonalAccessToken = require('../../../Models/PersonalAccessToken')

// What an API token may do: change this list for your app. 'abilities:posts:write' in a route checks it.
const ABILITIES = ['read', 'create', 'update', 'delete']

// API tokens for scripts and other apps (pages/Profile.som → API tokens), like Jetstream / Sanctum
class ApiTokenController {
  // GET /api/user/tokens
  async index(req) {
    if (req.accessToken && req.accessToken.type !== 'session' && !req.accessToken.can('*')) abort(403, 'Only browser sessions may manage API tokens.')
    const rows = await PersonalAccessToken.where('user_id', req.user.id).where('type', 'api').orderByDesc('id').get()
    return { abilities: ABILITIES, tokens: rows.map((t) => ({ id: t.id, name: t.name, abilities: t.abilities || ['*'], last_used_at: t.last_used_at, created_at: t.created_at })) }
  }

  // POST /api/user/tokens  { name, abilities: ['read'] } → the token, shown this one time only
  async store(req) {
    if (req.accessToken && req.accessToken.type !== 'session' && !req.accessToken.can('*')) abort(403, 'Only browser sessions may create API tokens.')
    const data = await req.validate({ name: 'required|string|max:100', abilities: 'sometimes|array' })
    const abilities = (data.abilities || ['read']).filter((a) => ABILITIES.includes(a))
    if (!abilities.length) abort(422, 'Choose at least one permission.')
    const { accessToken, plainTextToken } = await req.user.createToken(data.name, { type: 'api', abilities })
    return response({ id: accessToken.id, name: accessToken.name, abilities, token: plainTextToken }, 201)
  }

  // PUT /api/user/tokens/{id}  { abilities }
  async update(req, id) {
    if (req.accessToken && req.accessToken.type !== 'session' && !req.accessToken.can('*')) abort(403, 'Only browser sessions may update API tokens.')
    const token = await PersonalAccessToken.where('user_id', req.user.id).where('type', 'api').find(id)
    if (!token) abort(404, 'No such token.')
    const { abilities } = await req.validate({ abilities: 'required|array' })
    token.abilities = abilities.filter((a) => ABILITIES.includes(a))
    await token.save()
    return { id: token.id, abilities: token.abilities }
  }

  // DELETE /api/user/tokens/{id}
  async destroy(req, id) {
    if (req.accessToken && req.accessToken.type !== 'session' && !req.accessToken.can('*')) abort(403, 'Only browser sessions may delete API tokens.')
    const token = await PersonalAccessToken.where('user_id', req.user.id).where('type', 'api').find(id)
    if (!token) abort(404, 'No such token.')
    await token.delete()
    return noContent()
  }
}

module.exports = ApiTokenController
