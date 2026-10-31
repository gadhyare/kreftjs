// som dev runs it once by itself; som migrate:rollback runs down()
module.exports = {
  up(schema) {
    schema.create('tasks', (table) => {
      table.id()
      table.string('title', 120).unique()
      table.enum('priority', ['low', 'normal', 'high']).default('normal')
      table.boolean('done').default(false)
      table.timestamps()
    })
  },

  down(schema) {
    schema.dropIfExists('tasks')
  },
}
