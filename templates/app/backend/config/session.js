/**
 * Session Configuration
 *
 * Controls server session storage, lifetimes, cookie attributes,
 * and inactivity timeouts for both backend and frontend.
 *
 *   config('session.lifetime')
 *   config('session.inactivity_timeout')
 */
module.exports = {
  // Session storage driver: 'file', 'cookie', 'database', 'redis'
  driver: process.env.SESSION_DRIVER || 'file',

  // Session lifetime in minutes on the server
  lifetime: Number(process.env.SESSION_LIFETIME) || 120,

  // Invalidate session immediately when browser window closes
  expire_on_close: process.env.SESSION_EXPIRE_ON_CLOSE === 'true',

  // Inactivity timeout in minutes before redirecting to login on the client
  inactivity_timeout: Number(process.env.PUBLIC_SESSION_TIMEOUT || process.env.SESSION_INACTIVITY_TIMEOUT) || 15,

  // Inactivity warning in minutes before session expires
  warning_before: Number(process.env.PUBLIC_SESSION_WARNING) || 2,

  // Redirect destination when session times out due to inactivity
  redirect_url: '/login?reason=inactive',

  // Cookie settings
  cookie: process.env.SESSION_COOKIE || 'kreft_session',
  path: '/',
  domain: process.env.SESSION_DOMAIN || null,
  secure: process.env.SESSION_SECURE_COOKIE ? process.env.SESSION_SECURE_COOKIE === 'true' : process.env.APP_ENV === 'production',
  http_only: true,
  same_site: 'lax',
};
