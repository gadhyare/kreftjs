const { Model } = require('kreft/server')

// The tasks table (database/migrations/…_create_tasks_table.js)
class Task extends Model {
  static fillable = ['title', 'priority', 'done']
  static casts = {
    title: 'strip_tags',
    done: 'boolean',
  }
}

module.exports = Task
