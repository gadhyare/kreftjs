// Global middleware for every API route: at most 120 requests a minute
// per visitor for each address, so a script can't hammer the API. Names in `aliases` point to your own files in app/Http/.
module.exports = {
  middleware: ['throttle:120,1'],
  aliases: {
    // 'subscribed': 'Middleware/Billing/EnsureSubscribed.js',
  },
}
