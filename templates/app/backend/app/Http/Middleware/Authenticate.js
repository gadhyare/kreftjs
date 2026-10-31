// 'auth' in the routes: only signed-in users get through, and req.user is the user.
// A browser is signed in with the HttpOnly som_session cookie (app/Auth/Session.js);
// an app or script with  Authorization: Bearer 5|k3J9…  (an API token, see /profile → API tokens).
const { abort, Hash, Str, Crypt } = require('somjs/server')
const crypto = require('crypto')
const PersonalAccessToken = require('../../Models/PersonalAccessToken')
const User = require('../../Models/User')
const { SESSION, XSRF } = require('../../Auth/Session')

const SAFE = ['GET', 'HEAD', 'OPTIONS']
const same = (a, b) => Boolean(a) && Boolean(b) && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))

class Authenticate {
  async handle(req, next) {
    const bearer = req.bearerToken()
    const fromCookie = !bearer && req.cookie(SESSION)
    let sessionPayload = fromCookie
    if (fromCookie) {
      try {
        sessionPayload = Crypt.decryptString(fromCookie)
      } catch (_) {
        // APP_KEY was changed or rotated, or cookie was tampered with!
        // Immediately destroy session and force the user to log in again:
        abort(401, 'Unauthenticated. Application key was rotated, please sign in again.')
      }
    }
    const [id, plain] = String(bearer || sessionPayload || '').split('|')
    const token = id && plain ? await PersonalAccessToken.find(id) : null
    if (!token || !same(token.token, Hash.sha256(plain))) abort(401, 'Unauthenticated.')

    // a cookie login must prove the page is ours for every change: X-XSRF-TOKEN = the XSRF-TOKEN cookie
    if (fromCookie && !SAFE.includes(req.method) && !same(req.header('x-xsrf-token'), req.cookie(XSRF))) {
      abort(419, 'CSRF token mismatch. Reload the page and try again.')
    }

    // expired: session lifetime in minutes (inactivity timeout) or AUTH_TOKEN_DAYS without use
    const days = Number(process.env.AUTH_TOKEN_DAYS || 30)
    const sessionMinutes = Number(process.env.SESSION_LIFETIME || 120)
    const lastUsed = new Date(token.last_used_at || token.created_at).getTime()
    const isSessionExpired = token.type === 'session' && !token.remember && sessionMinutes > 0 && (Date.now() - lastUsed > sessionMinutes * 60000)
    const isDaysExpired = days > 0 && Date.now() - lastUsed > days * 86400000
    const isHardExpired = token.expires_at && new Date(token.expires_at).getTime() < Date.now()

    if (isSessionExpired || isDaysExpired || isHardExpired) {
      await token.delete()
      abort(401, 'Unauthenticated.')
    }

    const user = await User.find(token.user_id)
    if (!user) abort(401, 'Unauthenticated.')

    // remember when this device was last used (at most once a minute)
    if (!token.last_used_at || Date.now() - new Date(token.last_used_at).getTime() > 60000) {
      token.last_used_at = new Date()
      token.ip_address = req.ip()
      await token.save()
    }
    req.user = user
    req.accessToken = token
    const response = await next(req)
    // a cookie login without the XSRF cookie (cleared, or an old browser): give it a new one
    if (fromCookie && !req.cookie(XSRF)) response.cookie(XSRF, Str.random(40), { httpOnly: false, maxAge: token.remember ? days * 86400 : undefined })
    return response
  }
}

module.exports = Authenticate
