/**
 * Application Configuration
 *
 * Global settings for the application. Access with:
 *   const { config } = require('kreft/server')
 *   config('app.name')
 */
module.exports = {
  name: process.env.APP_NAME || 'Kreft Application',
  env: process.env.APP_ENV || 'production',
  debug: (process.env.APP_DEBUG || 'false').toLowerCase() === 'true',
  url: process.env.APP_URL || 'http://localhost:3000',
  timezone: process.env.APP_TIMEZONE || 'UTC',
  locale: process.env.APP_LOCALE || 'en',
  fallbackLocale: 'en',
};
