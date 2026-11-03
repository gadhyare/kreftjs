// Your API: every address here starts with /api.
// All API routes live directly in this file. Add your new routes here!
// See them all anytime with: kreft route:list
const { Route, use, namespace } = require('kreftjs/server')

// PHP-style namespace imports (e.g. use('App\Http\Controllers\Admin\UserController')):
const { DashboardController, UserController } = namespace('App\\Http\\Controllers\\Admin')

// Authentication routes (login, register, password reset, 2FA)
require('./auth')

// Dashboard telemetry & stats (protected)
Route.middleware('auth').group(() => {
  Route.get('/stats', [DashboardController, 'index']).name('stats')
  Route.get('/admin/stats', [DashboardController, 'index']).name('admin.stats')
  Route.get('/admin/me', [DashboardController, 'me']).name('admin.me')
  Route.get('/dashboard', (req) => ({ greeting: `Welcome back, ${req.user ? req.user.name : 'User'}.` }))
})

// User management endpoints (admin only)
Route.apiResource('admin/users', UserController, { only: ['index', 'update', 'destroy'] }).middleware(['auth', 'admin'])
Route.apiResource('users', UserController, { only: ['index', 'update', 'destroy'] }).middleware(['auth', 'admin'])

// Example public endpoint: GET /api/hello?name=World
Route.get('/hello', (req) => ({ hello: req.input('name', 'world'), app: process.env.APP_NAME }))
