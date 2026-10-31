const { Model } = require('somjs/server')

// A signed-in browser (type 'session') or an API token (type 'api'). Only a hash of the token is kept.
class PersonalAccessToken extends Model {
  static table = 'personal_access_tokens'
  static fillable = ['user_id', 'type', 'name', 'token', 'abilities', 'ip_address', 'user_agent', 'remember', 'last_used_at', 'password_confirmed_at', 'expires_at']
  static hidden = ['token']
  static casts = { abilities: 'json', remember: 'boolean', last_used_at: 'datetime', password_confirmed_at: 'datetime', expires_at: 'datetime', created_at: 'datetime' }

  user() { return this.belongsTo(require('./User')) }

  // token.can('posts:write'): what an API token was made for ('*' = everything; browser sessions can do everything)
  can(ability) {
    if (this.type === 'session') return true
    const list = this.abilities || ['*']
    return list.includes('*') || list.includes(ability)
  }
  cant(ability) { return !this.can(ability) }
}

module.exports = PersonalAccessToken
