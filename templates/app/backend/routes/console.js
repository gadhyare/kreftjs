// What runs on a schedule. kreft dev runs it while it is on;
// on a server: kreft schedule:work (or `kreft schedule:run` from cron every minute). See them: kreft schedule:list
const { Schedule } = require('kreft/server')

// Schedule.call(async () => { … }).daily().name('clean-up')
// Schedule.job(new SendDailyReport()).weekdays().at('08:00')
// Schedule.command('cache:clear').hourly()

// remove login tokens nobody used for a long time
Schedule.call(async () => {
  const PersonalAccessToken = require('../app/Models/PersonalAccessToken')
  const days = Number(process.env.AUTH_TOKEN_DAYS || 30)
  const before = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19).replace('T', ' ')
  await PersonalAccessToken.query().where('last_used_at', '<', before).delete()
}).daily().name('prune-old-tokens')
