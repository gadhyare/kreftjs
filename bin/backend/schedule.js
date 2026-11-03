/*
 * Task scheduling: backend/routes/console.js says what runs when.
 *
 *   const { Schedule } = require('kreftjs/server')
 *   Schedule.call(async () => { await Post.onlyTrashed().forceDelete() }).daily().name('clean-trash')
 *   Schedule.job(new SendDailyReport()).weekdays().at('08:00')
 *   Schedule.command('cache:clear').hourly()
 *   Schedule.call(fn).cron('* /15 * * * *')     (no space: every 15 minutes)
 *
 * kreft dev runs them while it is on; for a real server: kreft schedule:work (or `kreft schedule:run` from cron each minute).
 */
const tasks = [];

function field(spec, value, min, max) {
  if (spec == null || spec === '') return false;
  return String(spec).split(',').some((part) => {
    let [range, step] = part.split('/');
    step = step !== undefined ? Number(step) : 1;
    if (!Number.isInteger(step) || step <= 0) return false;
    let lo = min, hi = max;
    if (range !== '*') {
      const [a, b] = range.split('-').map(Number);
      lo = a;
      hi = b === undefined ? (part.includes('/') ? max : a) : b;
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo > hi) return false;
    return value >= lo && value <= hi && (value - lo) % step === 0;
  });
}
function due(expr, d = new Date()) {
  if (typeof expr !== 'string') return false;
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return false;
  const [m, h, dom, mon, dow] = parts;
  return field(m, d.getMinutes(), 0, 59) && field(h, d.getHours(), 0, 23) && field(dom, d.getDate(), 1, 31) && field(mon, d.getMonth() + 1, 1, 12) && field(dow, d.getDay(), 0, 6);
}

class Task {
  constructor(run, label) { this.run = run; this.label = label; this.expr = '* * * * *'; this.days = null; this.overlap = true; this.running = false; this.condition = null; }
  cron(expr) { this.expr = expr; return this; }
  _set(i, v) { const p = this.expr.split(' '); p[i] = String(v); this.expr = p.join(' '); return this; }
  everyMinute() { return this.cron('* * * * *'); }
  everyTwoMinutes() { return this.cron('*/2 * * * *'); }
  everyFiveMinutes() { return this.cron('*/5 * * * *'); }
  everyTenMinutes() { return this.cron('*/10 * * * *'); }
  everyFifteenMinutes() { return this.cron('*/15 * * * *'); }
  everyThirtyMinutes() { return this.cron('0,30 * * * *'); }
  hourly() { return this.cron('0 * * * *'); }
  hourlyAt(minute) { return this.cron(`${minute} * * * *`); }
  daily() { return this.cron('0 0 * * *'); }
  dailyAt(time) { const [h, m = 0] = String(time).split(':').map(Number); return this.cron(`${m} ${h} * * *`); }
  at(time) { const [h, m = 0] = String(time).split(':').map(Number); return this._set(0, m)._set(1, h); }
  twiceDaily(a = 1, b = 13) { return this.cron(`0 ${a},${b} * * *`); }
  weekly() { return this.cron('0 0 * * 0'); }
  weeklyOn(day, time = '0:00') { const [h, m = 0] = String(time).split(':').map(Number); return this.cron(`${m} ${h} * * ${day}`); }
  monthly() { return this.cron('0 0 1 * *'); }
  monthlyOn(day = 1, time = '0:00') { const [h, m = 0] = String(time).split(':').map(Number); return this.cron(`${m} ${h} ${day} * *`); }
  yearly() { return this.cron('0 0 1 1 *'); }
  weekdays() { return this._set(4, '1-5'); }
  weekends() { return this._set(4, '0,6'); }
  sundays() { return this._set(4, 0); } mondays() { return this._set(4, 1); } tuesdays() { return this._set(4, 2); }
  wednesdays() { return this._set(4, 3); } thursdays() { return this._set(4, 4); } fridays() { return this._set(4, 5); } saturdays() { return this._set(4, 6); }
  when(fn) { this.condition = fn; return this; }
  withoutOverlapping() { this.overlap = false; return this; }
  name(n) { this.label = n; return this; }
  description(n) { return this.name(n); }
  isDue(d) { return due(this.expr, d); }
  async execute(log = () => { }) {
    if (!this.overlap && this.running) return log(`  skipped   ${this.label} (still running)`);
    if (this.condition && !(await this.condition())) return;
    this.running = true;
    const started = Date.now();
    try { await this.run(); log(`  ran       ${this.label} (${Date.now() - started} ms)`); }
    catch (e) { log(`  failed    ${this.label}: ${e.message}`); require('./support.js').Log.error(`Scheduled task ${this.label} failed: ${e.message}`); }
    finally { this.running = false; }
  }
}

const Schedule = {
  call(fn) { const t = new Task(fn, 'Closure'); tasks.push(t); return t; },
  job(job) { const t = new Task(() => require('./queue.js').dispatch(job), job.constructor.name); tasks.push(t); return t; },
  command(line) { const t = new Task(() => require('../artisan.js').runCommand(line), 'kreft ' + line); tasks.push(t); return t; },
  tasks: () => tasks,
  reset() { tasks.length = 0; },
  // runs the tasks due this minute
  async runDue(log, d = new Date()) { for (const t of tasks) if (t.isDue(d)) await t.execute(log); },
};

// load backend/routes/console.js (again after a change)
function loadSchedule(baseDir) {
  const { findFile } = require('./typescript.js');
  const file = findFile(require('path').join(baseDir, 'routes', 'console'));
  Schedule.reset();
  if (!file) return null;
  delete require.cache[require.resolve(file)];
  require(file);
  return file;
}
// kreft dev / kreftjs schedule:work: check every minute, on the minute
function startScheduler(baseDir, log = console.log) {
  let timer = null;
  const tick = async () => {
    try { loadSchedule(baseDir); await Schedule.runDue(log); } catch (e) { log('  schedule: ' + e.message); }
    timer = setTimeout(tick, 60000 - (Date.now() % 60000) + 50);
    if (timer.unref) timer.unref();
  };
  timer = setTimeout(tick, 60000 - (Date.now() % 60000) + 50);
  if (timer.unref) timer.unref();
  return () => clearTimeout(timer);
}

module.exports = { Schedule, Task, due, loadSchedule, startScheduler };
