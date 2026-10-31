// The notifications table: user.notify(…) with the 'database' channel, user.notifications()
module.exports = {
  up(schema) {
    schema.create('notifications', (table) => {
      table.string('id', 36).primary()
      table.string('type')
      table.string('notifiable_type')
      table.bigInteger('notifiable_id')
      table.text('data')
      table.timestamp('read_at').nullable()
      table.timestamps()
      table.index(['notifiable_type', 'notifiable_id'])
    })
  },
  down(schema) {
    schema.dropIfExists('notifications')
  },
}
