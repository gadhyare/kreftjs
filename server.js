/*
 * Kreft on the server: routes, controllers, models, migrations, seeders, middleware and namespaces.
 *
 *   const { Route, Model, DB, Seeder, abort, response, use, namespace } = require('kreft/server')
 *
 * `kreft dev` and `kreft serve` load routes/api.js and answer /api/... with it.
 */
module.exports = require('./bin/backend/index.js');
