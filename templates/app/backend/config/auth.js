/**
 * Authentication & Security Configuration
 *
 * Session lifetime, password hashing, and token guards.
 *   config('auth.defaults.guard')
 *   config('auth.session.lifetime')
 */
module.exports = {
  defaults: {
    guard: 'web',
    passwords: 'users',
  },

  guards: {
    web: {
      driver: 'session',
      provider: 'users',
    },
    api: {
      driver: 'token',
      provider: 'users',
    },
  },

  session: {
    lifetime: Number(process.env.SESSION_LIFETIME) || 120, // minutes
    expireOnClose: false,
    encrypt: true,
    cookie: 'som_session',
    secure: process.env.APP_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
  },
};
