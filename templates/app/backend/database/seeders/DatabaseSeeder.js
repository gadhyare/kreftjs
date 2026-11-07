const { Seeder, Hash } = require('kreftjs/server')
const User = require('../../app/Models/User')

// kreft db:seed  (kreft dev --seed fills a new database). Sign in as test@example.com / password;
// that user is an admin too, so /admin opens for it
class DatabaseSeeder extends Seeder {
  async run() {
    // an admin whose password is "password" must never exist on a live site: this seeder is for development only
    if (process.env.APP_ENV === 'production' || process.env.NODE_ENV === 'production') {
      throw new Error('DatabaseSeeder creates an admin with the password "password" and refuses to run in production. Seed real data instead.')
    }
    const user = await User.create({ name: 'Test User', email: 'test@example.com', password: Hash.make('password') })
    user.email_verified_at = new Date()
    user.is_admin = true // never fillable: only set like this, by your own code
    await user.save()
  }
}

module.exports = DatabaseSeeder
