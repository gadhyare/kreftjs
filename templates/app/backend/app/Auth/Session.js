// Signing a browser in and out via secure SPA session cookies.
//
// A browser gets its login in an HttpOnly cookie (kreft_session): page scripts can't read it, so a
// script injected into a page can't steal it. Changes (POST, PUT, DELETE…) also need the X-XSRF-TOKEN
// header to match the XSRF-TOKEN cookie, which only your own pages can read (Kreftjs.api sends it by itself).
//
// An app or script that sends `device_name` when it logs in gets an API token in the answer instead:
// Authorization: Bearer 5|k3J9…
const { response, Str, Crypt, Hash, cookieSecure } = require('kreftjs/server')
const PersonalAccessToken = require('../Models/PersonalAccessToken')

const SESSION = 'kreft_session'
const XSRF = 'XSRF-TOKEN'
// The XSRF-TOKEN cookie is not a random value anyone could plant: it is derived from this login's secret token, so a
// page on a sibling subdomain (or a script that can only set cookies) cannot make one that matches. Only a page that
// can read this browser's cookie, i.e. your own, can send it back in X-XSRF-TOKEN.
const xsrfFor = (sessionToken) => Hash.sha256('xsrf|' + sessionToken)
const days = () => Number(process.env.AUTH_TOKEN_DAYS || 30)

const resolveSecure = () => typeof cookieSecure === 'function' ? cookieSecure() : (process.env.SESSION_SECURE_COOKIE ? process.env.SESSION_SECURE_COOKIE === 'true' : (process.env.APP_ENV === 'production' || /^https:/i.test(process.env.APP_URL || '')))
const resolveSameSite = () => process.env.SESSION_SAME_SITE || 'Lax'

// the answer to a successful login or register
async function signIn(req, user, { remember = false, status = 200 } = {}) {
  const deviceName = req.input('device_name')
  if (deviceName) { // an app or a script: a Bearer token
    const { plainTextToken } = await user.createToken(deviceName, { type: 'api', ip: req.ip(), userAgent: req.header('user-agent') })
    return response({ user, token: plainTextToken }, status)
  }

  // Session fixation prevention: invalidate any previous session in this browser
  const fromCookie = req.cookie(SESSION)
  if (fromCookie) {
    try {
      const oldPayload = Crypt.decryptString(fromCookie)
      const [oldId] = String(oldPayload || '').split('|')
      if (oldId) {
        await PersonalAccessToken.where('id', oldId).delete()
      }
    } catch (_) {
      // ignore invalid / rotated old session tokens
    }
  }

  // Generate a completely new session identifier and token
  const { plainTextToken } = await user.createToken(browserName(req.header('user-agent', '')), {
    type: 'session', ip: req.ip(), userAgent: req.header('user-agent'), remember,
  })
  const res = response({ user }, status)
  // "Remember me": the cookie stays for AUTH_TOKEN_DAYS; otherwise it goes when the browser closes
  // Cryptographically seal session token with APP_KEY (AES-256-GCM with fresh 12-byte random IV).
  // If APP_KEY is changed or rotated, existing session cookies fail authentication and are destroyed.
  const encryptedSession = Crypt.encryptString(plainTextToken)
  const isSecure = resolveSecure()
  const sameSite = resolveSameSite()

  res.cookie(SESSION, encryptedSession, {
    httpOnly: true,
    secure: isSecure,
    sameSite,
    path: '/',
    maxAge: remember ? days() * 86400 : undefined,
  })
  res.cookie(XSRF, xsrfFor(plainTextToken), {
    httpOnly: false,
    secure: isSecure,
    sameSite,
    path: '/',
    maxAge: remember ? days() * 86400 : undefined,
  })
  return res
}

// Regenerates the session token (Session Fixation Prevention on privilege change)
async function regenerate(req, res, user = null) {
  const targetUser = user || req.user
  if (!targetUser) return res

  if (req.accessToken) {
    await req.accessToken.delete()
  } else if (req.cookie(SESSION)) {
    try {
      const oldPayload = Crypt.decryptString(req.cookie(SESSION))
      const [oldId] = String(oldPayload || '').split('|')
      if (oldId) await PersonalAccessToken.where('id', oldId).delete()
    } catch (_) {}
  }

  const { accessToken, plainTextToken } = await targetUser.createToken(browserName(req.header('user-agent', '')), {
    type: 'session', ip: req.ip(), userAgent: req.header('user-agent'), remember: req.accessToken ? req.accessToken.remember : false,
  })
  req.accessToken = accessToken

  const encryptedSession = Crypt.encryptString(plainTextToken)
  const isSecure = resolveSecure()
  const sameSite = resolveSameSite()
  const remember = accessToken.remember

  res.cookie(SESSION, encryptedSession, {
    httpOnly: true,
    secure: isSecure,
    sameSite,
    path: '/',
    maxAge: remember ? days() * 86400 : undefined,
  })
  res.cookie(XSRF, xsrfFor(plainTextToken), {
    httpOnly: false,
    secure: isSecure,
    sameSite,
    path: '/',
    maxAge: remember ? days() * 86400 : undefined,
  })
  return res
}

function signOut(res) {
  return res.withoutCookie(SESSION).withoutCookie(XSRF)
}

// two-factor: after the password, the login waits (5 minutes) for the code in an encrypted cookie
const usedTwoFactorTickets = new Map()
const twoFactorAttempts = new Map()
setInterval(() => {
  const now = Date.now()
  for (const [k, exp] of usedTwoFactorTickets) if (exp < now) usedTwoFactorTickets.delete(k)
  for (const [k, v] of twoFactorAttempts) if (v.exp < now) twoFactorAttempts.delete(k)
}, 60000).unref()

function pendingTwoFactor(req, user, remember) {
  const nonce = Str.random(24)
  const exp = Date.now() + 5 * 60000
  const ticket = Crypt.encrypt({ id: user.id, remember: Boolean(remember), nonce, exp })
  if (req.input('device_name')) return response({ two_factor: true, challenge: ticket })
  return response({ two_factor: true }).cookie('kreft_2fa', ticket, { maxAge: 300 })
}
function readPendingTwoFactor(req) {
  const ticket = req.input('challenge') || req.cookie('kreft_2fa')
  if (!ticket) return null
  try {
    const t = Crypt.decrypt(ticket)
    if (!t || !(t.exp > Date.now())) return null
    if (t.nonce && usedTwoFactorTickets.has(t.nonce)) return null
    if (t.nonce) {
      const state = twoFactorAttempts.get(t.nonce) || { count: 0, exp: t.exp }
      if (state.count >= 5) {
        if (usedTwoFactorTickets.size >= 10000) usedTwoFactorTickets.delete(usedTwoFactorTickets.keys().next().value)
        usedTwoFactorTickets.set(t.nonce, t.exp)
        return null
      }
    }
    return t
  } catch (_) { return null }
}
function recordTwoFactorFailure(pending) {
  if (!pending || !pending.nonce) return
  const state = twoFactorAttempts.get(pending.nonce) || { count: 0, exp: pending.exp }
  state.count++
  if (!twoFactorAttempts.has(pending.nonce) && twoFactorAttempts.size >= 10000) {
    twoFactorAttempts.delete(twoFactorAttempts.keys().next().value)
  }
  twoFactorAttempts.set(pending.nonce, state)
  if (state.count >= 5) {
    if (usedTwoFactorTickets.size >= 10000) usedTwoFactorTickets.delete(usedTwoFactorTickets.keys().next().value)
    usedTwoFactorTickets.set(pending.nonce, pending.exp)
  }
}
function consumeTwoFactorTicket(pending) {
  if (!pending || !pending.nonce) return
  if (usedTwoFactorTickets.size >= 10000) usedTwoFactorTickets.delete(usedTwoFactorTickets.keys().next().value)
  usedTwoFactorTickets.set(pending.nonce, pending.exp)
  twoFactorAttempts.delete(pending.nonce)
}

// "Chrome on macOS", for the list of devices
function browserName(ua) {
  const b = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /curl|node|axios|python/i.test(ua) ? 'Script' : 'Browser'
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : ''
  return os ? `${b} on ${os}` : b
}

module.exports = { xsrfFor, signIn, signOut, regenerate, pendingTwoFactor, readPendingTwoFactor, recordTwoFactorFailure, consumeTwoFactorTicket, browserName, SESSION, XSRF }
