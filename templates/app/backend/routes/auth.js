// Authentication routes (sign in, register, password reset, 2FA). routes/api.js loads this file.
const { Route } = require('kreft/server')
const RegisteredUserController = require('../app/Http/Controllers/Auth/RegisteredUserController')
const AuthenticatedSessionController = require('../app/Http/Controllers/Auth/AuthenticatedSessionController')
const PasswordResetLinkController = require('../app/Http/Controllers/Auth/PasswordResetLinkController')
const NewPasswordController = require('../app/Http/Controllers/Auth/NewPasswordController')
const EmailVerificationController = require('../app/Http/Controllers/Auth/EmailVerificationController')
const ConfirmablePasswordController = require('../app/Http/Controllers/Auth/ConfirmablePasswordController')
const TwoFactorController = require('../app/Http/Controllers/Auth/TwoFactorController')
const TwoFactorChallengeController = require('../app/Http/Controllers/Auth/TwoFactorChallengeController')
const SessionController = require('../app/Http/Controllers/Auth/SessionController')
const ApiTokenController = require('../app/Http/Controllers/Auth/ApiTokenController')
const ProfileController = require('../app/Http/Controllers/ProfileController')

// for visitors: 6 tries a minute, so passwords and codes can't be guessed quickly
Route.middleware('throttle:6,1').group(() => {
  Route.post('/register', [RegisteredUserController, 'store']).name('register')
  Route.post('/login', [AuthenticatedSessionController, 'store']).name('login')
  Route.post('/two-factor-challenge', [TwoFactorChallengeController, 'store']).name('two-factor.login')
  Route.post('/forgot-password', [PasswordResetLinkController, 'store']).name('password.email')
  Route.post('/reset-password', [NewPasswordController, 'store']).name('password.store')
  Route.post('/email/verify', [EmailVerificationController, 'verify']).name('verification.verify')
})

// for signed-in users ('auth': app/Http/Middleware/Authenticate.js)
Route.middleware('auth').group(() => {
  Route.get('/user', [ProfileController, 'show']).name('user')
  Route.post('/logout', [AuthenticatedSessionController, 'destroy']).name('logout')
  Route.post('/email/verification-notification', [EmailVerificationController, 'send']).middleware('throttle:6,1').name('verification.send')
  Route.post('/confirm-password', [ConfirmablePasswordController, 'store']).middleware('throttle:6,1').name('password.confirm')
  Route.patch('/profile', [ProfileController, 'update']).name('profile.update')
  Route.put('/password', [ProfileController, 'password']).name('password.update')
  Route.delete('/profile', [ProfileController, 'destroy']).middleware('password.confirm').name('profile.destroy')

  // two-factor authentication (an authenticator app)
  Route.prefix('/user/two-factor').name('two-factor.').group(() => {
    Route.post('/', [TwoFactorController, 'enable']).middleware('password.confirm').name('enable')
    Route.post('/confirm', [TwoFactorController, 'confirm']).middleware('throttle:6,1').name('confirm')
    Route.delete('/', [TwoFactorController, 'disable']).middleware('password.confirm').name('disable')
    Route.get('/recovery-codes', [TwoFactorController, 'recoveryCodes']).middleware('password.confirm').name('recovery-codes')
    Route.post('/recovery-codes', [TwoFactorController, 'regenerate']).middleware('password.confirm').name('regenerate')
  })

  // the devices signed in, and API tokens for scripts and apps
  Route.get('/user/sessions', [SessionController, 'index']).name('sessions.index')
  Route.delete('/user/sessions', [SessionController, 'destroyOthers']).middleware('password.confirm').name('sessions.others')
  Route.delete('/user/sessions/{id}', [SessionController, 'destroy']).name('sessions.destroy')
  Route.get('/user/tokens', [ApiTokenController, 'index']).name('tokens.index')
  Route.post('/user/tokens', [ApiTokenController, 'store']).name('tokens.store')
  Route.put('/user/tokens/{id}', [ApiTokenController, 'update']).name('tokens.update')
  Route.delete('/user/tokens/{id}', [ApiTokenController, 'destroy']).name('tokens.destroy')
})
