const { Seeder } = require('kreftjs/server')
const Task = require('../../app/Models/Task')

// kreftjs dev --seed fills a new database with these (or: node bin/kreftjs.js db:seed --backend demo)
class DatabaseSeeder extends Seeder {
  async run() {
    await Task.create({ title: 'Read routes/api.js', priority: 'high', done: true })
    await Task.create({ title: 'Make a model: kreftjs make:model Post --all', priority: 'normal' })
    await Task.create({ title: 'Add a middleware', priority: 'low' })
  }
}

module.exports = DatabaseSeeder
