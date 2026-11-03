// not_common_password: the worst passwords are refused, ordinary good ones are not
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const Kreftjs = require(path.join(__dirname, '..', 'kreftjs.js'));
const RULES = { password: 'required|min:8|confirmed|not_common_password' };
const check = (password, extra = {}) => Kreftjs.validate({ password, password_confirmation: password, ...extra }, RULES);

test('not_common_password refuses common, repeated, sequential and email-like passwords', () => {
  for (const bad of ['password', 'Password123', '12345678', 'qwertyuiop', 'iloveyou', 'aaaaaaaa', 'abcdefgh', '87654321']) {
    assert.ok(check(bad).password, bad + ' should be refused');
  }
  assert.ok(check('jo@example.com', { email: 'jo@example.com' }).password, 'the email address');
  assert.ok(check('maxamuud', { email: 'maxamuud@example.com' }).password, 'the part before the @');
  assert.match(check('password').password[0], /too common/);
});

test('not_common_password lets a good password through, and a short one still fails min first', () => {
  for (const good of ['correct horse battery', 'T7#kq9!vLm2', 'x9Zr!2Qw', 'blue-tiger-42-lamp']) {
    assert.deepStrictEqual(check(good), {}, good + ' should pass');
  }
  assert.ok(check('abc').password, 'too short');
});

test('the new-app templates use the rule on every password they set', () => {
  const fs = require('node:fs');
  const root = path.join(__dirname, '..', 'templates', 'app');
  for (const f of ['backend/app/Http/Controllers/Auth/RegisteredUserController.js', 'backend/app/Http/Controllers/Auth/NewPasswordController.js',
    'backend/app/Http/Controllers/ProfileController.js', 'frontend/pages/auth/Register.kreft', 'frontend/pages/auth/ResetPassword.kreft', 'frontend/pages/Profile.kreft']) {
    assert.ok(/password: '[^']*not_common_password/.test(fs.readFileSync(path.join(root, f), 'utf8')), f + ' misses not_common_password');
  }
});
