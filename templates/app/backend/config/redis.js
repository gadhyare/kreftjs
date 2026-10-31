/**
 * Redis & Cache Configuration
 *
 * Built-in native Redis client, cache stores, and background queue settings.
 *   config('redis.default.host')
 *   config('redis.cache.ttl')
 */
module.exports = {
  default: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || null,
    db: Number(process.env.REDIS_DB) || 0,
    prefix: process.env.REDIS_PREFIX || 'som_database_',
  },

  cache: {
    driver: process.env.CACHE_STORE || 'redis',
    ttl: Number(process.env.CACHE_DEFAULT_TTL) || 3600,
    prefix: 'som_cache_',
  },

  queue: {
    driver: process.env.QUEUE_CONNECTION || 'redis',
    prefix: 'som_jobs_',
    defaultQueue: 'default',
  },
};
