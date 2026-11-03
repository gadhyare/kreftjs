/*
 * Jobs and background queue workers.
 *
 *   // app/Jobs/SendWelcomeEmail.js
 *   const { Job, Mail } = require('kreftjs/server')
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
 * QUEUE_CONNECTION in .env: database (the jobs table; kreftjs dev and `kreftjs queue:work` run them) or sync (at once).
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Builder, getConnection } = require('./query.js');

function controlPath() {
  const app = require('./app.js');
  const base = (app && typeof app.baseDir === 'function' && app.baseDir()) || process.cwd();
  return path.join(base, 'storage', 'framework', 'queue_control.json');
}

let controlCache = { at: 0, data: { stoppedAll: false, stoppedQueues: [], restartAt: 0 } };

function readControl() {
  if (Date.now() - controlCache.at < 500) return controlCache.data;
  const p = controlPath();
  try {
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      controlCache = {
        at: Date.now(),
        data: {
          stoppedAll: Boolean(data.stoppedAll),
          stoppedQueues: Array.isArray(data.stoppedQueues) ? data.stoppedQueues : [],
          restartAt: Number(data.restartAt) || 0,
        }
      };
      return controlCache.data;
    }
  } catch (_) {}
  controlCache = { at: Date.now(), data: { stoppedAll: false, stoppedQueues: [], restartAt: 0 } };
  return controlCache.data;
}

function writeControl(data) {
  const p = controlPath();
  try {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
    controlCache = { at: Date.now(), data };
  } catch (_) {
    controlCache = { at: Date.now(), data };
  }
}

function stop(queueName = null) {
  const current = readControl();
  if (!queueName || queueName === 'all' || queueName === '*') {
    current.stoppedAll = true;
    current.stoppedQueues = [];
  } else {
    const q = String(queueName).trim();
    if (!current.stoppedQueues.includes(q)) current.stoppedQueues.push(q);
  }
  current.updatedAt = new Date().toISOString();
  writeControl(current);
  return current;
}

function stopAll() {
  return stop('all');
}

function resume(queueName = null) {
  const current = readControl();
  if (!queueName || queueName === 'all' || queueName === '*') {
    current.stoppedAll = false;
    current.stoppedQueues = [];
  } else {
    const q = String(queueName).trim();
    current.stoppedQueues = current.stoppedQueues.filter((x) => x !== q);
    current.stoppedAll = false;
  }
  current.updatedAt = new Date().toISOString();
  writeControl(current);
  return current;
}

function resumeAll() {
  return resume('all');
}

function isStopped(queueName = null) {
  const ctrl = readControl();
  if (ctrl.stoppedAll) return true;
  if (!queueName) return false;
  return ctrl.stoppedQueues.includes(String(queueName).trim());
}

function restart() {
  const current = readControl();
  current.restartAt = Date.now();
  current.updatedAt = new Date().toISOString();
  writeControl(current);
  return current;
}

function status() {
  return readControl();
}

function getStoppedQueues() {
  return readControl().stoppedQueues;
}

class Job {
  static tries = 1;
  static backoff = 0;
  static queue = 'default';
  static dispatch(...args) {
    const instance = new this(...args);
    const opts = { delay: 0, queue: this.queue };
    let promise = null;
    const run = () => {
      if (!promise) promise = dispatch(instance, opts);
      return promise;
    };
    return {
      delay(seconds) { opts.delay = Number(seconds) || 0; return this; },
      onQueue(queueName) { opts.queue = queueName; return this; },
      then(onFulfilled, onRejected) { return run().then(onFulfilled, onRejected); },
      catch(onRejected) { return run().catch(onRejected); },
      finally(onFinally) { return run().finally(onFinally); },
    };
  }
  static dispatchSync(...args) {
    return dispatchSync(new this(...args));
  }
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

/* ---- models become { __kreft_model, id } on the queue, and models again when the job runs */
const { isBadKey, parseJson } = require('../safe-json.js');

function hydrateInstance(Proto, data) {
  const inst = Object.create(Proto);
  if (data && typeof data === 'object') {
    for (const [k, v] of Object.entries(data)) {
      if (isBadKey(k) || typeof Proto[k] === 'function') continue;
      inst[k] = v;
    }
  }
  return inst;
}

function serialize(value) {
  const { Model } = require('./model.js');
  if (value instanceof Model) return { __kreft_model: value.constructor.name, id: value[value.constructor.primaryKey] };
  if (value instanceof Date) return { __kreft_date: value.toISOString() };
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k]) => !isBadKey(k)).map(([k, v]) => [k, serialize(v)]));
  return value;
}
async function restore(value) {
  if (Array.isArray(value)) return Promise.all(value.map(restore));
  if (value && typeof value === 'object') {
    if (value.__kreft_model) {
      const M = require('./app.js').find(value.__kreft_model, 'model');
      if (!M) throw new Error(`The model ${value.__kreft_model} is not in app/Models.`);
      const m = await M.query().withTrashed().find(value.id);
      if (!m) throw Object.assign(new Error(`${value.__kreft_model} ${value.id} no longer exists.`), { missingModel: true });
      return m;
    }
    if (value.__kreft_date) return new Date(value.__kreft_date);
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (isBadKey(k)) continue;
      out[k] = await restore(v);
    }
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
    // TODO(3.1): the 'som:queue:' / 'som:delayed:' key names keep their Som.js spelling so waiting jobs survive the rename
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
    const job = hydrateInstance(C.prototype, data);
    return job.handle();
  }
  if (p.kind === 'listener') {
    const L = app.find(p.class, 'listener');
    if (!L) throw new Error(`The listener ${p.class} is not in app/Listeners.`);
    let ev = data.event;
    if (ev && ev.class) { const E = app.find(ev.class, 'event'); ev = E ? hydrateInstance(E.prototype, ev.data) : ev.data; }
    return new L().handle(ev, ...(data.payload || []));
  }
  if (p.kind === 'mail') {
    const M = app.find(p.class, 'mail');
    if (!M) throw new Error(`The mail ${p.class} is not in app/Mail.`);
    const mailable = hydrateInstance(M.prototype, data.mailable);
    return require('./mail.js').Mail.to(data.to).cc(data.cc || []).bcc(data.bcc || []).send(mailable);
  }
  if (p.kind === 'notification') {
    const N = app.find(p.class, 'notification');
    if (!N) throw new Error(`The notification ${p.class} is not in app/Notifications.`);
    const n = hydrateInstance(N.prototype, data.notification);
    return require('./notifications.js').sendNow(data.notifiable, n, data.channels);
  }
  throw new Error(`Unknown queued kind ${p.kind}`);
}

// takes one job that is due, runs it; → 'done' | 'failed' | 'released' | null (nothing to do)
async function workOne({ queues = ['default'], log = () => {} } = {}) {
  const ctrl = readControl();
  if (ctrl.stoppedAll) return null;
  const targetQueues = (queues.includes('*') ? ['default'] : queues).filter((q) => !isStopped(q));
  if (!targetQueues.length) return null;

  const conn = await connection();
  if (conn === 'redis') {
    const { Redis } = require('./redis.js');
    const redis = Redis.connection('queue');
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
      const p = parseJson(raw);
      const C = require('./app.js').find(p.class);
      const tries = (C && C.tries) || 1;
      const attempts = Number(p.attempts || 0) + 1;
      const started = Date.now();
      try {
        await runPayload(p);
        log(`  ${new Date().toISOString().slice(11, 19)} ${p.class} ${'.'.repeat(Math.max(2, 40 - p.class.length))} DONE ${Date.now() - started}ms`);
        return 'done';
      } catch (e) {
        if (attempts < tries && !e.missingModel) {
          const backoff = [].concat((C && C.backoff) || 0);
          const waitSec = Number(backoff[Math.min(attempts - 1, backoff.length - 1)] || 0);
          const retryPayload = JSON.stringify({ ...p, attempts });
          if (waitSec > 0) await redis.zadd('som:delayed:' + qName, now() + waitSec, retryPayload);
          else await redis.lpush('som:queue:' + qName, retryPayload);
          log(`  ${new Date().toISOString().slice(11, 19)} ${p.class} ${'.'.repeat(Math.max(2, 40 - p.class.length))} RETRY (${attempts}/${tries}): ${e.message}`);
          return 'released';
        }
        try {
          if (await tablesReady()) {
            await new Builder('failed_jobs').insert({ uuid: p.uuid || crypto.randomUUID(), queue: qName, payload: raw, exception: String(e && e.stack || e).slice(0, 8000), failed_at: new Date().toISOString().slice(0, 19).replace('T', ' ') });
          }
          if (C && C.prototype && typeof C.prototype.failed === 'function' && p.kind === 'job') {
            const job = hydrateInstance(C.prototype, await restore(p.data).catch(() => p.data));
            await job.failed(e);
          }
        } catch (_) {}
        log(`  ${new Date().toISOString().slice(11, 19)} ${p.class} ${'.'.repeat(Math.max(2, 40 - p.class.length))} FAILED: ${e.message}`);
        return 'failed';
      }
    }
    return null;
  }
  if (!(await tablesReady())) return null;
  const db = getConnection();
  const q = new Builder('jobs').whereNull('reserved_at').where('available_at', '<=', now()).orderBy('id');
  q.whereIn('queue', targetQueues);
  const row = await q.first();
  if (!row) return null;
  // claim it (another worker may have been quicker)
  const claimed = await new Builder('jobs').where('id', row.id).whereNull('reserved_at').update({ reserved_at: now(), attempts: Number(row.attempts) + 1 });
  if (!claimed) return 'skipped';
  const p = parseJson(row.payload);
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
        const job = hydrateInstance(C.prototype, await restore(p.data).catch(() => p.data));
        await job.failed(e);
      }
    } catch (_) { /* failed() itself failed */ }
    log(`  ${new Date().toISOString().slice(11, 19)} ${p.class} ${'.'.repeat(Math.max(2, 40 - p.class.length))} FAILED: ${e.message}`);
    void db;
    return 'failed';
  }
}

// kreftjs queue:work — runs jobs as they come (stop with Ctrl+C)
async function work({ queues = ['default'], once = false, sleep = 1, maxJobs = Infinity, log = console.log, stopWhenEmpty = false } = {}) {
  const workerStartedAt = Date.now();
  let n = 0;
  for (;;) {
    const ctrl = readControl();
    if (ctrl.restartAt && ctrl.restartAt > workerStartedAt) {
      log('  Queue worker stopping gracefully due to restart signal.');
      return n;
    }
    if (ctrl.stoppedAll) {
      if (once || stopWhenEmpty) return n;
      await new Promise((res) => setTimeout(res, sleep * 1000));
      continue;
    }
    const targetQueues = (queues.includes('*') ? ['default'] : queues).filter((q) => !isStopped(q));
    if (!targetQueues.length) {
      if (once || stopWhenEmpty) return n;
      await new Promise((res) => setTimeout(res, sleep * 1000));
      continue;
    }
    const r = await workOne({ queues: targetQueues, log });
    if (r === 'done' || r === 'failed' || r === 'released') { n++; if (once || n >= maxJobs) return n; continue; }
    if (once || stopWhenEmpty) return n;
    await new Promise((res) => setTimeout(res, sleep * 1000));
  }
}

module.exports = {
  Job, dispatch, dispatchSync, push, work, workOne, runPayload, serialize, restore,
  tablesReady, forget, connection,
  stop, stopAll, resume, resumeAll, restart, status, isStopped, getStoppedQueues
};
