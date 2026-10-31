/*
 * Jobs and background queue workers.
 *
 *   // app/Jobs/SendWelcomeEmail.js
 *   const { Job, Mail } = require('somjs/server')
 *   class SendWelcomeEmail extends Job {
 *     static tries = 3          // try again after an error, up to 3 times
 *     static backoff = 10       // seconds to wait before trying again
 *     constructor(user) { super(); this.user = user }   // models are stored as their id and read again
 *     async handle() { await Mail.to(this.user.email).send(new WelcomeMail(this.user)) }
 *     failed(error) { … }       // after the last try
 *   }
 *
 *   await dispatch(new SendWelcomeEmail(user))                       // on the queue
 *   await dispatch(new SendWelcomeEmail(user), { delay: 60 })        // in a minute
 *   await dispatchSync(new SendWelcomeEmail(user))                   // now
 *
 * QUEUE_CONNECTION in .env: database (the jobs table; som dev and `som queue:work` run them) or sync (at once).
 */
const crypto = require('crypto');
const { Builder, getConnection } = require('./query.js');

class Job {
  static tries = 1;
  static backoff = 0;
  static queue = 'default';
  async handle() {}
}

const now = () => Math.floor(Date.now() / 1000);
let hasTables = null;
async function tablesReady() {
  if (hasTables !== null) return hasTables;
  try { const names = (await getConnection().tables()).map((t) => t.name); hasTables = names.includes('jobs') && names.includes('failed_jobs'); }
  catch (_) { hasTables = false; }
  return hasTables;
}
const forget = () => { hasTables = null; };
async function connection() {
  const want = (process.env.QUEUE_CONNECTION || 'database').toLowerCase();
  if (want === 'sync') return 'sync';
  if (want === 'redis') return 'redis';
  return (await tablesReady()) ? 'database' : 'sync';
}

/* ---- models become { __som_model, id } on the queue, and models again when the job runs */
function serialize(value) {
  const { Model } = require('./model.js');
  if (value instanceof Model) return { __som_model: value.constructor.name, id: value[value.constructor.primaryKey] };
  if (value instanceof Date) return { __som_date: value.toISOString() };
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serialize(v)]));
  return value;
}
async function restore(value) {
  if (Array.isArray(value)) return Promise.all(value.map(restore));
  if (value && typeof value === 'object') {
    if (value.__som_model) {
      const M = require('./app.js').find(value.__som_model, 'model');
      if (!M) throw new Error(`The model ${value.__som_model} is not in app/Models.`);
      const m = await M.query().withTrashed().find(value.id);
      if (!m) throw Object.assign(new Error(`${value.__som_model} ${value.id} no longer exists.`), { missingModel: true });
      return m;
    }
    if (value.__som_date) return new Date(value.__som_date);
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = await restore(v);
    return out;
  }
  return value;
}

// the job as stored: what to make again, and its data
function payloadOf(kind, className, data) { return JSON.stringify({ uuid: crypto.randomUUID(), kind, class: className, data: serialize(data) }); }

async function push(kind, className, data, { delay = 0, queue } = {}) {
  const conn = await connection();
  if (conn === 'sync') return runPayload(JSON.parse(payloadOf(kind, className, data)));
  const C = require('./app.js').find(className);
  const qName = queue || (C && C.queue && typeof C.queue === 'string' ? C.queue : 'default');
  const payload = payloadOf(kind, className, data);

  if (conn === 'redis') {
    const { Redis } = require('./redis.js');
    const redis = Redis.connection('queue');
    if (delay > 0) {
      await redis.zadd('som:delayed:' + qName, now() + Math.max(0, Number(delay) || 0), payload);
    } else {
      await redis.lpush('som:queue:' + qName, payload);
    }
    return true;
  }

  await new Builder('jobs').insert({
    queue: qName,
    payload, attempts: 0, reserved_at: null,
    available_at: now() + Math.max(0, Number(delay) || 0), created_at: now(),
  });
  return true;
}
async function dispatch(job, { delay = 0, queue } = {}) {
  const C = job.constructor;
  if (!require('./app.js').find(C.name)) return runJob(job); // not in app/Jobs: nothing could find it later, so run it now
  return push('job', C.name, { ...job }, { delay, queue: queue || C.queue });
}
async function dispatchSync(job) { return runJob(job); }
async function runJob(job) { return job.handle(); }

// make the stored thing again and run it
async function runPayload(p) {
  const app = require('./app.js');
  const data = await restore(p.data);
  if (p.kind === 'job') {
    const C = app.find(p.class, 'job') || app.find(p.class);
    if (!C) throw new Error(`The job ${p.class} is not in app/Jobs.`);
    const job = Object.assign(Object.create(C.prototype), data);
    return job.handle();
  }
  if (p.kind === 'listener') {
    const L = app.find(p.class, 'listener');
    if (!L) throw new Error(`The listener ${p.class} is not in app/Listeners.`);
    let ev = data.event;
    if (ev && ev.class) { const E = app.find(ev.class, 'event'); ev = E ? Object.assign(Object.create(E.prototype), ev.data) : ev.data; }
    return new L().handle(ev, ...(data.payload || []));
  }
  if (p.kind === 'mail') {
    const M = app.find(p.class, 'mail');
    if (!M) throw new Error(`The mail ${p.class} is not in app/Mail.`);
    const mailable = Object.assign(Object.create(M.prototype), data.mailable);
    return require('./mail.js').Mail.to(data.to).cc(data.cc || []).bcc(data.bcc || []).send(mailable);
  }
  if (p.kind === 'notification') {
    const N = app.find(p.class, 'notification');
    if (!N) throw new Error(`The notification ${p.class} is not in app/Notifications.`);
    const n = Object.assign(Object.create(N.prototype), data.notification);
    return require('./notifications.js').sendNow(data.notifiable, n, data.channels);
  }
  throw new Error(`Unknown queued kind ${p.kind}`);
}

// takes one job that is due, runs it; → 'done' | 'failed' | 'released' | null (nothing to do)
async function workOne({ queues = ['default'], log = () => {} } = {}) {
  const conn = await connection();
  if (conn === 'redis') {
    const { Redis } = require('./redis.js');
    const redis = Redis.connection('queue');
    const targetQueues = queues.includes('*') ? ['default'] : queues;
    for (const qName of targetQueues) {
      // Move delayed jobs that became ready into the main list
      try {
        const due = await redis.zrangebyscore('som:delayed:' + qName, '-inf', now());
        if (Array.isArray(due) && due.length > 0) {
          for (const item of due) {
            const removed = await redis.zrem('som:delayed:' + qName, item);
            if (removed) await redis.lpush('som:queue:' + qName, item);
          }
        }
      } catch (_) {}

      let raw = null;
      try { raw = await redis.rpop('som:queue:' + qName); } catch (_) {}
      if (!raw) continue;
      const p = JSON.parse(raw);
      const C = require('./app.js').find(p.class);
      const started = Date.now();
      try {
        await runPayload(p);
        log(`  ${new Date().toISOString().slice(11, 19)} ${p.class} ${'.'.repeat(Math.max(2, 40 - p.class.length))} DONE ${Date.now() - started}ms`);
        return 'done';
      } catch (e) {
        log(`  ${new Date().toISOString().slice(11, 19)} ${p.class} ${'.'.repeat(Math.max(2, 40 - p.class.length))} FAILED: ${e.message}`);
        return 'failed';
      }
    }
    return null;
  }
  if (!(await tablesReady())) return null;
  const db = getConnection();
  const q = new Builder('jobs').whereNull('reserved_at').where('available_at', '<=', now()).orderBy('id');
  if (!queues.includes('*')) q.whereIn('queue', queues);
  const row = await q.first();
  if (!row) return null;
  // claim it (another worker may have been quicker)
  const claimed = await new Builder('jobs').where('id', row.id).whereNull('reserved_at').update({ reserved_at: now(), attempts: Number(row.attempts) + 1 });
  if (!claimed) return 'skipped';
  const p = JSON.parse(row.payload);
  const C = require('./app.js').find(p.class);
  const tries = (C && C.tries) || 1;
  const started = Date.now();
  try {
    await runPayload(p);
    await new Builder('jobs').where('id', row.id).delete();
    log(`  ${new Date().toISOString().slice(11, 19)} ${p.class} ${'.'.repeat(Math.max(2, 40 - p.class.length))} DONE ${Date.now() - started}ms`);
    return 'done';
  } catch (e) {
    const attempts = Number(row.attempts) + 1;
    if (attempts < tries && !e.missingModel) {
      const backoff = [].concat((C && C.backoff) || 0);
      await new Builder('jobs').where('id', row.id).update({ reserved_at: null, available_at: now() + Number(backoff[Math.min(attempts - 1, backoff.length - 1)] || 0) });
      log(`  ${new Date().toISOString().slice(11, 19)} ${p.class} ${'.'.repeat(Math.max(2, 40 - p.class.length))} RETRY (${attempts}/${tries}): ${e.message}`);
      return 'released';
    }
    await new Builder('jobs').where('id', row.id).delete();
    await new Builder('failed_jobs').insert({ uuid: p.uuid || crypto.randomUUID(), queue: row.queue, payload: row.payload, exception: String(e && e.stack || e).slice(0, 8000), failed_at: new Date().toISOString().slice(0, 19).replace('T', ' ') });
    try {
      if (C && C.prototype && typeof C.prototype.failed === 'function' && p.kind === 'job') {
        const job = Object.assign(Object.create(C.prototype), await restore(p.data).catch(() => p.data));
        await job.failed(e);
      }
    } catch (_) { /* failed() itself failed */ }
    log(`  ${new Date().toISOString().slice(11, 19)} ${p.class} ${'.'.repeat(Math.max(2, 40 - p.class.length))} FAILED: ${e.message}`);
    void db;
    return 'failed';
  }
}

// som queue:work — runs jobs as they come (stop with Ctrl+C)
async function work({ queues = ['default'], once = false, sleep = 1, maxJobs = Infinity, log = console.log, stopWhenEmpty = false } = {}) {
  let n = 0;
  for (;;) {
    const r = await workOne({ queues, log });
    if (r === 'done' || r === 'failed' || r === 'released') { n++; if (once || n >= maxJobs) return n; continue; }
    if (once || stopWhenEmpty) return n;
    await new Promise((res) => setTimeout(res, sleep * 1000));
  }
}

module.exports = { Job, dispatch, dispatchSync, push, work, workOne, runPayload, serialize, restore, tablesReady, forget, connection };
