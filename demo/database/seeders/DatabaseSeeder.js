const { Seeder } = require('kreft/server')
const Task = require('../../app/Models/Task')

// kreft dev --seed fills a new database with these (or: node bin/kreft.js db:seed --backend demo)
class DatabaseSeeder extends Seeder {
  async run() {
    await Task.create({ title: 'Read routes/api.js', priority: 'high', done: true })
    await Task.create({ title: 'Make a model: kreft make:model Post --all', priority: 'normal' })
    await Task.create({ title: 'Add a middleware', priority: 'low' })
  }
}

module.exports = DatabaseSeeder
