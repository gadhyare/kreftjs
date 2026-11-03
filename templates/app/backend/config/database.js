/**
 * Database Configuration
 *
 * Connection settings for databases: SQLite, MySQL, and PostgreSQL.
 *   config('database.default')
 *   config('database.connections.sqlite.database')
 */
module.exports = {
  default: process.env.DB_CONNECTION || 'sqlite',

  connections: {
    sqlite: {
      driver: 'sqlite',
      database: process.env.DB_DATABASE || 'database/database.sqlite',
      foreignKeyConstraints: true,
    },

    mysql: {
      driver: 'mysql',
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT) || 3306,
      database: process.env.DB_DATABASE || 'kreft',
      username: process.env.DB_USERNAME || 'root',
      password: process.env.DB_PASSWORD || '',
      charset: 'utf8mb4',
    },

    pgsql: {
      driver: 'pgsql',
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_DATABASE || 'kreft',
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || '',
      ssl: process.env.DB_SSL === 'true',
    },
  },
};
