const { Seeder, Hash } = require('somjs/server')
const User = require('../../app/Models/User')

// som db:seed  (som dev --seed fills a new database). Sign in as test@example.com / password;
// that user is an admin too, so /admin opens for it
class DatabaseSeeder extends Seeder {
  async run() {
    const user = await User.create({ name: 'Test User', email: 'test@example.com', password: Hash.make('password') })
    user.email_verified_at = new Date()
    user.is_admin = true // never fillable: only set like this, by your own code
    await user.save()
  }
}

module.exports = DatabaseSeeder
