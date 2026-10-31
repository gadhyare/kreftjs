// Signing a browser in and out via secure SPA session cookies.
//
// A browser gets its login in an HttpOnly cookie (som_session): page scripts can't read it, so a
// script injected into a page can't steal it. Changes (POST, PUT, DELETE…) also need the X-XSRF-TOKEN
// header to match the XSRF-TOKEN cookie, which only your own pages can read (Som.api sends it by itself).
//
// An app or script that sends `device_name` when it logs in gets an API token in the answer instead:
// Authorization: Bearer 5|k3J9…
const { response, Str, Crypt } = require('somjs/server')

const SESSION = 'som_session'
const XSRF = 'XSRF-TOKEN'
const days = () => Number(process.env.AUTH_TOKEN_DAYS || 30)

// the answer to a successful login or register
async function signIn(req, user, { remember = false, status = 200 } = {}) {
  const deviceName = req.input('device_name')
  if (deviceName) { // an app or a script: a Bearer token
    const { plainTextToken } = await user.createToken(deviceName, { type: 'api', ip: req.ip(), userAgent: req.header('user-agent') })
    return response({ user, token: plainTextToken }, status)
  }
  const { plainTextToken } = await user.createToken(browserName(req.header('user-agent', '')), {
    type: 'session', ip: req.ip(), userAgent: req.header('user-agent'), remember,
  })
  const res = response({ user }, status)
  // "Remember me": the cookie stays for AUTH_TOKEN_DAYS; otherwise it goes when the browser closes
  // Cryptographically seal session token with APP_KEY (AES-256-GCM).
  // If APP_KEY is changed or rotated, existing session cookies fail authentication and are destroyed.
  const encryptedSession = Crypt.encryptString(plainTextToken)
  res.cookie(SESSION, encryptedSession, { maxAge: remember ? days() * 86400 : undefined })
  res.cookie(XSRF, Str.random(40), { httpOnly: false, maxAge: remember ? days() * 86400 : undefined })
  return res
}

function signOut(res) {
  return res.withoutCookie(SESSION).withoutCookie(XSRF)
}

// two-factor: after the password, the login waits (5 minutes) for the code in an encrypted cookie
function pendingTwoFactor(req, user, remember) {
  const ticket = Crypt.encrypt({ id: user.id, remember: Boolean(remember), exp: Date.now() + 5 * 60000 })
  if (req.input('device_name')) return response({ two_factor: true, challenge: ticket })
  return response({ two_factor: true }).cookie('som_2fa', ticket, { maxAge: 300 })
}
function readPendingTwoFactor(req) {
  const ticket = req.input('challenge') || req.cookie('som_2fa')
  if (!ticket) return null
  try {
    const t = Crypt.decrypt(ticket)
    return t && t.exp > Date.now() ? t : null
  } catch (_) { return null }
}

// "Chrome on macOS", for the list of devices
function browserName(ua) {
  const b = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /curl|node|axios|python/i.test(ua) ? 'Script' : 'Browser'
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : ''
  return os ? `${b} on ${os}` : b
}

module.exports = { signIn, signOut, pendingTwoFactor, readPendingTwoFactor, browserName, SESSION, XSRF }
