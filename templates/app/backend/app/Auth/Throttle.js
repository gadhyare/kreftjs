// Failed-attempt counters kept per account (not per address), in the Cache so every process shares them.
// The 'throttle:6,1' route limit counts per address; this one stops a guesser who changes address:
//   const wait = await Throttle.wait('login', email, 10)    // seconds to wait, 0 when allowed
//   if (wait) abort(429, …)   …   await Throttle.hit('login', email, 900)   …   await Throttle.clear('login', email)
const { Cache, Hash } = require('kreft/server')

const key = (scope, id) => `throttle:${scope}:${Hash.sha256(String(id).trim().toLowerCase())}`

// seconds until this account may try again, or 0
async function wait(scope, id, max) {
  const s = await Cache.get(key(scope, id))
  if (!s || !(s.resetAt > Date.now()) || s.count < max) return 0
  return Math.max(1, Math.ceil((s.resetAt - Date.now()) / 1000))
}

// one more failure, counted for `windowSeconds` from the first one
async function hit(scope, id, windowSeconds = 900) {
  const k = key(scope, id)
  const s = await Cache.get(k)
  const cur = s && s.resetAt > Date.now() ? s : { count: 0, resetAt: Date.now() + windowSeconds * 1000 }
  cur.count++
  await Cache.put(k, cur, Math.max(1, Math.ceil((cur.resetAt - Date.now()) / 1000)))
}

async function clear(scope, id) {
  await Cache.forget(key(scope, id))
}

module.exports = { wait, hit, clear }
