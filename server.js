/*
 * Som.js on the server: routes, controllers, models, migrations, seeders, middleware and namespaces.
 *
 *   const { Route, Model, DB, Seeder, abort, response, use, namespace } = require('somjs/server')
 *
 * `som dev` and `som serve` load routes/api.js and answer /api/... with it.
 */
module.exports = require('./bin/backend/index.js');
