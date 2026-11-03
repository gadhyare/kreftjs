// The tables for user authentication. kreftjs dev runs it by itself (or: kreftjs migrate).
module.exports = {
  up(schema) {
    schema.create('users', (table) => {
      table.id()
      table.string('name')
      table.string('email').unique()
      table.timestamp('email_verified_at').nullable()
      table.string('password')
      table.boolean('is_admin').default(false)   // may open the admin panel (/admin)
      table.string('role', 40).default('user')   // 'role:editor' in the routes; user.hasRole('editor')
      table.text('two_factor_secret').nullable()          // encrypted (Crypt), for the authenticator app
      table.text('two_factor_recovery_codes').nullable()  // encrypted list of one-time codes
      table.timestamp('two_factor_confirmed_at').nullable()
      table.timestamps()
    })

    // the links sent by "Forgot your password?" (only a hash of each token is kept)
    schema.create('password_reset_tokens', (table) => {
      table.string('email').primary()
      table.string('token')
      table.timestamp('created_at').nullable()
    })

    // one row per signed-in browser (type 'session', in an HttpOnly cookie) or API token (type 'api').
    // Only a hash of each token is kept.
    schema.create('personal_access_tokens', (table) => {
      table.id()
      table.foreignId('user_id').constrained().cascadeOnDelete()
      table.string('type', 20).default('session')
      table.string('name')
      table.string('token', 64).unique()
      table.text('abilities').nullable()          // ["posts:read", "posts:write"] or ["*"]
      table.string('ip_address', 45).nullable()
      table.string('user_agent', 255).nullable()
      table.boolean('remember').default(false)
      table.timestamp('last_used_at').nullable()
      table.timestamp('password_confirmed_at').nullable()
      table.timestamp('expires_at').nullable()
      table.timestamps()
    })
  },

  down(schema) {
    schema.dropIfExists('personal_access_tokens')
    schema.dropIfExists('password_reset_tokens')
    schema.dropIfExists('users')
  },
}
