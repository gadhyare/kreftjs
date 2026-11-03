// The login cookie is Secure in production unless SESSION_SECURE_COOKIE says otherwise; the new-app template must not say otherwise
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { cookieSecure } = require(path.join(__dirname, '..', 'bin', 'backend', 'http.js'));
const KEYS = ['APP_ENV', 'NODE_ENV', 'APP_URL', 'SESSION_SECURE_COOKIE'];
const withEnv = (env, fn) => {
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, env);
  try { return fn(); } finally { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
};

test('cookieSecure: Secure in production and on https, plain in local development', () => {
  assert.strictEqual(withEnv({ APP_ENV: 'production' }, cookieSecure), true);
  assert.strictEqual(withEnv({ NODE_ENV: 'production' }, cookieSecure), true);
  assert.strictEqual(withEnv({ APP_URL: 'https://example.com' }, cookieSecure), true);
  assert.strictEqual(withEnv({ APP_ENV: 'local', APP_URL: 'http://localhost:8000' }, cookieSecure), false);
});

test('the new-app .env template does not switch the Secure flag or the https redirect off', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', 'templates', 'app', '_env.example'), 'utf8');
  assert.ok(!/^\s*SESSION_SECURE_COOKIE\s*=\s*false\s*$/m.test(text), 'SESSION_SECURE_COOKIE=false must not be set by default');
  assert.ok(!/^\s*FORCE_HTTPS\s*=\s*false\s*$/m.test(text), 'FORCE_HTTPS=false must not be set by default');
});
