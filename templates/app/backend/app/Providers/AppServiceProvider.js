// Runs once when the backend starts (and again after a change).
// A place for gates, event listeners and settings that belong to the whole app.
const { Gate } = require('somjs/server')

class AppServiceProvider {
  boot() {
    // Gate.define('view-reports', (user) => user.hasRole('editor'))   → await req.authorize('view-reports')
    Gate.define('manage-users', (user) => user.is_admin)
  }
}

module.exports = AppServiceProvider
