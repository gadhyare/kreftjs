// The cache table (CACHE_STORE=database): Cache.put(), Cache.remember(), Cache.lock()
module.exports = {
  up(schema) {
    schema.create('cache', (table) => {
      table.string('key').primary()
      table.text('value')
      table.integer('expiration').default(0)
    })
  },
  down(schema) {
    schema.dropIfExists('cache')
  },
}
