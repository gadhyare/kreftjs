// The queue's tables: jobs waiting (kreftjs queue:work, or kreftjs dev, runs them) and jobs that failed
module.exports = {
  up(schema) {
    schema.create('jobs', (table) => {
      table.id()
      table.string('queue').index()
      table.longText('payload')
      table.integer('attempts').default(0)
      table.integer('reserved_at').nullable()
      table.integer('available_at')
      table.integer('created_at')
    })
    schema.create('failed_jobs', (table) => {
      table.id()
      table.string('uuid').unique()
      table.string('queue')
      table.longText('payload')
      table.longText('exception')
      table.timestamp('failed_at').useCurrent()
    })
  },
  down(schema) {
    schema.dropIfExists('failed_jobs')
    schema.dropIfExists('jobs')
  },
}
