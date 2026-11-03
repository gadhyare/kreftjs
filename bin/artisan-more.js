/*
 * Full-stack CLI commands:
 *
 *   kreft list                         every command (yours too)
 *   kreft about                        versions, settings, folders
 *   kreft tinker                       a console with your models, DB, Cache… (await works)
 *   kreft key:generate                 a new APP_KEY in .env
 *   kreft down [--secret=x] / kreft up   maintenance mode
 *   kreft db:wipe                      drop every table
 *   kreft migrate:refresh [--seed]     undo every migration, then run them again
 *   kreft migrate:reset                undo every migration
 *   kreft queue:work [--queue=a,b] [--once] [--stop-when-empty]
 *   kreft queue:failed / queue:retry <id|all> / queue:flush / queue:table
 *   kreft schedule:work / schedule:run / schedule:list
 *   kreft cache:clear / cache:table
 *   kreft notifications:table
 *   kreft event:list
 *   kreft make:job, make:event, make:listener, make:mail, make:notification, make:policy, make:request,
 *       make:resource, make:factory, make:rule, make:command, make:observer
 *   Your own commands: app/Console/Commands/*.js (kreft make:command SendReport)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { commands, make, helpers } = require('./artisan.js');
const { options, context, withDb, write, nested, green, dim, migrationsOf, nextStamp, runSeed } = helpers;
const pkg = require('../package.json');

const yellow = (s) => (process.stdout.isTTY ? `\x1b[33m${s}\x1b[0m` : s);
const red = (s) => (process.stdout.isTTY ? `\x1b[31m${s}\x1b[0m` : s);
const cyan = (s) => (process.stdout.isTTY ? `\x1b[36m${s}\x1b[0m` : s);
const plural = (s) => require('./backend/schema.js').plural(s);
const snake = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

// everything the app needs in one go: its database, its classes, its listeners and schedule
async function withApp(o, ctx, fn) {
  await withDb(o, ctx, async (db, b) => {
    require('./backend/app.js').boot(ctx.base);
    await fn(db, b);
  });
}

/* ------------------------------------------------------------------ built-in migration tables */
const tableStubs = {
  jobs: `// The queue's tables: jobs waiting (kreft queue:work, or kreft dev, runs them) and jobs that failed
module.exports = {
  up(schema) {
    schema.create('jobs', (table) => {
      table.id()
      table.string('queue').index()
      table.longText('payload')
      table.integer('attempts').default(0)
      table.integer('reserved_at').nullable()
      table.integer('available_at')
      table.integer('created_at')
    })
    schema.create('failed_jobs', (table) => {
      table.id()
      table.string('uuid').unique()
      table.string('queue')
      table.longText('payload')
      table.longText('exception')
      table.timestamp('failed_at').useCurrent()
    })
  },
  down(schema) {
    schema.dropIfExists('failed_jobs')
    schema.dropIfExists('jobs')
  },
}
`,
  cache: `// The cache table (CACHE_STORE=database): Cache.put(), Cache.remember(), Cache.lock()
module.exports = {
  up(schema) {
    schema.create('cache', (table) => {
      table.string('key').primary()
      table.text('value')
      table.integer('expiration').default(0)
    })
  },
  down(schema) {
    schema.dropIfExists('cache')
  },
}
`,
  notifications: `// The notifications table: user.notify(…) with the 'database' channel, user.notifications()
module.exports = {
  up(schema) {
    schema.create('notifications', (table) => {
      table.string('id', 36).primary()
      table.string('type')
      table.string('notifiable_type')
      table.bigInteger('notifiable_id')
      table.text('data')
      table.timestamp('read_at').nullable()
      table.timestamps()
      table.index(['notifiable_type', 'notifiable_id'])
    })
  },
  down(schema) {
    schema.dropIfExists('notifications')
  },
}
`,
};
function tableCommand(kind, fileName) {
  return function (args) {
    const o = options(args), ctx = context(o);
    const dir = migrationsOf(o, ctx);
    const exists = fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.includes(fileName));
    if (exists) return console.log(`  There is already a ${fileName} migration.`);
    write(path.join(dir, `${nextStamp(dir)}_${fileName}.js`), tableStubs[kind]);
    console.log(dim('  Then: kreft migrate'));
  };
}
commands['queue:table'] = tableCommand('jobs', 'create_jobs_table');
commands['cache:table'] = tableCommand('cache', 'create_cache_table');
commands['notifications:table'] = tableCommand('notifications', 'create_notifications_table');

/* ------------------------------------------------------------------ queue */
commands['queue:work'] = async function (args) {
  const o = options(args), ctx = context(o);
  const raw = args.find((a) => a.startsWith('--queue=')) || '';
  const queues = (raw.split('=')[1] || 'default').split(',');
  await withApp(o, ctx, async () => {
    const q = require('./backend/queue.js');
    if (!(await q.tablesReady())) return console.error('  No jobs table. Make it with:  kreft queue:table, then kreft migrate');
    console.log(`  Working on the ${queues.join(', ')} queue${queues.length > 1 ? 's' : ''}. Stop with Ctrl+C.\n`);
    await q.work({ queues, once: o.flags.has('once'), stopWhenEmpty: o.flags.has('stop-when-empty'), log: console.log });
  });
};
commands['queue:failed'] = async function (args) {
  const o = options(args), ctx = context(o);
  await withDb(o, ctx, async (db) => {
    const rows = await db.query('SELECT id, queue, payload, exception, failed_at FROM failed_jobs ORDER BY id DESC LIMIT 50');
    if (!rows.length) return console.log('  No failed jobs.');
    for (const r of rows) console.log(`  ${String(r.id).padEnd(5)} ${String(r.failed_at).slice(0, 19)}  ${JSON.parse(r.payload).class}  ${dim(String(r.exception).split('\n')[0].slice(0, 90))}`);
    console.log(dim('\n  Try one again: kreft queue:retry <id>  (or all)'));
  });
};
commands['queue:retry'] = async function (args) {
  const o = options(args), ctx = context(o);
  const which = o._[0];
  if (!which) return console.error('  kreft queue:retry <id>   or   kreft queue:retry all');
  await withDb(o, ctx, async (db) => {
    const { Builder } = require('./backend/query.js');
    const rows = which === 'all' ? await new Builder('failed_jobs').get() : await new Builder('failed_jobs').where('id', which).get();
    const t = Math.floor(Date.now() / 1000);
    for (const r of rows) {
      await new Builder('jobs').insert({ queue: r.queue, payload: r.payload, attempts: 0, reserved_at: null, available_at: t, created_at: t });
      await new Builder('failed_jobs').where('id', r.id).delete();
      console.log(`  ${green('QUEUED')}  ${JSON.parse(r.payload).class} (failed job ${r.id})`);
    }
    if (!rows.length) console.log('  No such failed job.');
  });
};
commands['queue:flush'] = async function (args) {
  const o = options(args), ctx = context(o);
  await withDb(o, ctx, async (db) => { const n = (await db.run('DELETE FROM failed_jobs')).changes; console.log(`  Deleted ${n} failed job${n === 1 ? '' : 's'}.`); });
};
commands['queue:clear'] = async function (args) {
  const o = options(args), ctx = context(o);
  await withDb(o, ctx, async (db) => { const n = (await db.run('DELETE FROM jobs')).changes; console.log(`  Deleted ${n} waiting job${n === 1 ? '' : 's'}.`); });
};
commands['queue:stop'] = async function (args) {
  const o = options(args);
  const q = require('./backend/queue.js');
  const target = o.flags.has('all') ? 'all' : (o._[0] || 'all');
  q.stop(target);
  if (target === 'all' || target === '*') {
    console.log(`  ${red('STOPPED')} All running queues have been stopped.`);
    console.log(dim('  Resume anytime with: kreft queue:resume --all'));
  } else {
    console.log(`  ${yellow('STOPPED')} Queue "${target}" has been stopped.`);
    console.log(dim(`  Resume with: kreft queue:resume ${target}`));
  }
};
commands['queue:pause'] = commands['queue:stop'];

commands['queue:resume'] = async function (args) {
  const o = options(args);
  const q = require('./backend/queue.js');
  const target = o.flags.has('all') ? 'all' : (o._[0] || 'all');
  q.resume(target);
  if (target === 'all' || target === '*') {
    console.log(`  ${green('RESUMED')} All queues are now active and running.`);
  } else {
    console.log(`  ${green('RESUMED')} Queue "${target}" is now active and running.`);
  }
};
commands['queue:start'] = commands['queue:resume'];

commands['queue:restart'] = async function () {
  const q = require('./backend/queue.js');
  q.restart();
  console.log(`  ${green('SIGNALED')} Queue workers will gracefully finish active jobs and restart.`);
};

commands['queue:status'] = async function (args) {
  const o = options(args), ctx = context(o);
  const q = require('./backend/queue.js');
  const ctrl = q.status();
  console.log('\n  Queue System Status:\n');
  if (ctrl.stoppedAll) {
    console.log(`  Worker State:    ${red('STOPPED (ALL QUEUES)')}`);
  } else if (ctrl.stoppedQueues.length > 0) {
    console.log(`  Worker State:    ${yellow('PARTIALLY STOPPED')}`);
    console.log(`  Stopped Queues:  ${yellow(ctrl.stoppedQueues.join(', '))}`);
  } else {
    console.log(`  Worker State:    ${green('RUNNING')}`);
  }

  const { readConfig } = require('./kreft-config.js');
  const config = readConfig(ctx.base);
  const url = o.db || process.env.DATABASE_URL || config.db;
  if (url) {
    await withDb(o, ctx, async (db) => {
      if (await q.tablesReady()) {
        const rows = await db.query('SELECT queue, count(*) as count FROM jobs GROUP BY queue');
        console.log('\n  Pending Jobs:');
        if (!rows.length) {
          console.log('    No jobs waiting.');
        } else {
          for (const r of rows) {
            const stoppedTag = q.isStopped(r.queue) ? ` ${red('[STOPPED]')}` : '';
            console.log(`    - ${r.queue}: ${r.count} waiting${stoppedTag}`);
          }
        }
        const failed = await db.query('SELECT count(*) as count FROM failed_jobs');
        console.log(`\n  Failed Jobs:     ${failed[0] ? failed[0].count : 0}`);
      }
    }).catch(() => {});
  }
  console.log('');
};

/* ------------------------------------------------------------------ schedule */
commands['schedule:list'] = async function (args) {
  const o = options(args), ctx = context(o);
  require('./backend/index.js').installAlias();
  require('./backend/app.js').boot(ctx.base);
  const { loadSchedule, Schedule } = require('./backend/schedule.js');
  if (!loadSchedule(ctx.base)) return console.log('  No routes/console.js. Add tasks there:  Schedule.call(fn).daily()');
  const tasks = Schedule.tasks();
  if (!tasks.length) return console.log('  No tasks in routes/console.js.');
  for (const t of tasks) console.log(`  ${t.expr.padEnd(16)} ${t.label}`);
};
commands['schedule:run'] = async function (args) {
  const o = options(args), ctx = context(o);
  await withApp(o, ctx, async () => {
    const { loadSchedule, Schedule } = require('./backend/schedule.js');
    if (!loadSchedule(ctx.base)) return console.log('  No routes/console.js.');
    const due = Schedule.tasks().filter((t) => t.isDue(new Date()));
    if (!due.length) return console.log('  No tasks are due now.');
    for (const t of due) await t.execute(console.log);
  });
};
commands['schedule:work'] = async function (args) {
  const o = options(args), ctx = context(o);
  await withApp(o, ctx, async () => {
    const { loadSchedule, Schedule } = require('./backend/schedule.js');
    if (!loadSchedule(ctx.base)) return console.log('  No routes/console.js.');
    console.log(`  Running ${Schedule.tasks().length} scheduled task${Schedule.tasks().length === 1 ? '' : 's'} on time. Stop with Ctrl+C.\n`);
    for (;;) {
      await new Promise((r) => setTimeout(r, 60000 - (Date.now() % 60000) + 50));
      loadSchedule(ctx.base);
      await Schedule.runDue(console.log);
    }
  });
};

/* ------------------------------------------------------------------ storage & logs */
commands['storage:link'] = async function (args) {
  const o = options(args), ctx = context(o);
  const target = fs.existsSync(path.join(ctx.project, 'storage', 'app', 'public'))
    ? path.join(ctx.project, 'storage', 'app', 'public')
    : path.join(ctx.base, 'storage', 'app', 'public');
  fs.mkdirSync(target, { recursive: true });

  const candidateLinks = [
    ctx.frontend && ctx.frontend !== ctx.base ? path.join(ctx.frontend, 'public', 'storage') : null,
    path.join(ctx.project, 'public', 'storage'),
    ctx.base !== ctx.project ? path.join(ctx.base, 'public', 'storage') : null,
  ].filter(Boolean);

  const links = [...new Set(candidateLinks)];
  let created = 0;

  for (const linkPath of links) {
    const relLink = path.relative(ctx.project, linkPath);
    const relTarget = path.relative(ctx.project, target);
    try {
      const stat = fs.lstatSync(linkPath);
      if (stat) {
        if (o.flags.has('force')) {
          if (stat.isSymbolicLink()) fs.unlinkSync(linkPath);
          else fs.rmSync(linkPath, { recursive: true, force: true });
        } else {
          console.log(`  The [${relLink}] link already exists.`);
          continue;
        }
      }
    } catch (_) {
      // link does not exist yet
    }

    try {
      fs.mkdirSync(path.dirname(linkPath), { recursive: true });
      const absTarget = path.resolve(target);
      const symTarget = o.flags.has('relative') ? path.relative(path.dirname(path.resolve(linkPath)), absTarget) : absTarget;
      fs.symlinkSync(symTarget, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
      console.log(`  ${green('LINKED')}  The [${relLink}] link has been connected to [${relTarget}].`);
      created++;
    } catch (e) {
      console.error(`  ${red('ERROR')}   Could not link [${relLink}]: ${e.message}`);
    }
  }

  if (created > 0) {
    console.log(`\n  The public storage link${created === 1 ? '' : 's'} have been created.`);
  }
};

commands['storage:unlink'] = async function (args) {
  const o = options(args), ctx = context(o);
  const candidateLinks = [
    ctx.frontend && ctx.frontend !== ctx.base ? path.join(ctx.frontend, 'public', 'storage') : null,
    path.join(ctx.project, 'public', 'storage'),
    ctx.base !== ctx.project ? path.join(ctx.base, 'public', 'storage') : null,
  ].filter(Boolean);

  const links = [...new Set(candidateLinks)];
  let unlinked = 0;

  for (const linkPath of links) {
    const relLink = path.relative(ctx.project, linkPath);
    try {
      const stat = fs.lstatSync(linkPath);
      if (stat) {
        if (stat.isSymbolicLink()) fs.unlinkSync(linkPath);
        else fs.rmSync(linkPath, { recursive: true, force: true });
        console.log(`  ${green('UNLINKED')}  Removed [${relLink}].`);
        unlinked++;
      }
    } catch (_) {
      // not found
    }
  }

  if (!unlinked) {
    console.log(`  No storage links found to remove.`);
  }
};
commands['link:storage'] = commands['storage:link'];
commands['unlink:storage'] = commands['storage:unlink'];

/* ------------------------------------------------------------------ SEO & sitemap */
commands['sitemap'] = async function (args) {
  const o = options(args), ctx = context(o);
  const { createProgressBar } = require('./terminal.js');
  const baseUrl = o.url || process.env.APP_URL || 'http://localhost:8000';

  const routes = ['/'];
  // a route with a :param or * is a family of pages, not one address: it cannot be listed as it is
  const add = (p) => { if (p && p.startsWith('/') && !/[:*]/.test(p) && !routes.includes(p)) routes.push(p); };
  const webKreft = [
    path.join(ctx.frontend, 'routes', 'web.kreft'),
    path.join(ctx.project, 'routes', 'web.kreft'),
  ].find((f) => fs.existsSync(f));

  if (webKreft) {
    const src = fs.readFileSync(webKreft, 'utf8');
    for (const m of src.matchAll(/Route\.(?:view|get)\(\s*['"]([^'"]+)['"]/g)) add(m[1]);
  }

  // routes written in Kreft.router({ routes: [{ path: '/about', component: ... }] }) in index.html
  const indexHtml = [path.join(ctx.frontend, 'index.html'), path.join(ctx.project, 'index.html')].find((f) => fs.existsSync(f));
  if (indexHtml) {
    for (const line of fs.readFileSync(indexHtml, 'utf8').split('\n')) {
      if (/redirect\s*:/.test(line) || !/component\s*:/.test(line)) continue; // redirects and guards are not pages
      for (const m of line.matchAll(/path\s*:\s*['"]([^'"]+)['"]/g)) add(m[1]);
    }
  }

  // pages that come from your data: --urls urls.js, and `urls` in backend/routes/seo.js (it can use your models)
  const extra = [];
  try {
    if (o.urls) extra.push(...await require('./urls-file.js')(o.urls));
    if (fs.existsSync(path.join(ctx.base, 'routes')) && require('./backend/typescript.js').findFile(path.join(ctx.base, 'routes', 'seo'))) {
      const { readConfig } = require('./kreft-config.js');
      const dbUrl = o.db || process.env.DATABASE_URL || readConfig(ctx.base).db;
      const seoPages = require('./backend/seo-pages.js');
      const backend = require('./backend/index.js');
      backend.installAlias();
      let db = null;
      if (dbUrl) {
        db = await require('./db.js').connect(dbUrl, { root: readConfig(ctx.base).dir || ctx.project });
        backend.setConnection(db);
        require('./backend/model.js').setBaseDir(ctx.base);
      }
      try { extra.push(...await seoPages.urls(ctx.base)); } finally { if (db && typeof db.close === 'function') await db.close(); }
    }
  } catch (e) {
    console.error('  ' + String(e.message || e).replace(/\n/g, '\n  '));
    process.exitCode = 1;
    return;
  }
  for (const u of extra) {
    const p = typeof u === 'string' ? u : u.path;
    if (!p || /[:*]/.test(p) || routes.some((r) => (typeof r === 'string' ? r : r.path) === p)) continue;
    routes.push(u);
  }

  const bar = createProgressBar(routes.length, { label: 'Generating sitemap' });
  for (let i = 0; i < routes.length; i++) {
    bar.update(i + 1, typeof routes[i] === 'string' ? routes[i] : routes[i].path);
  }
  bar.complete(`${routes.length} URLs indexed`);

  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(baseUrl)) console.log(`  WARN  The sitemap uses ${baseUrl}. Search engines need your real address: kreft sitemap --url https://example.com (or set APP_URL)`);
  const { SEO } = require('./backend/support.js');
  const xml = SEO.sitemap(routes, { baseUrl });
  const robots = SEO.robots({ allow: '/', sitemapUrl: `${baseUrl.replace(/\/+$/, '')}/sitemap.xml` });

  const targetDirs = [
    path.join(ctx.project, 'public'),
    ctx.frontend && ctx.frontend !== ctx.project ? path.join(ctx.frontend, 'public') : null,
  ].filter(Boolean);

  for (const dir of targetDirs) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'sitemap.xml'), xml);
    fs.writeFileSync(path.join(dir, 'robots.txt'), robots);
    console.log(`  ${green('DONE')}  Created ${path.relative(ctx.project, path.join(dir, 'sitemap.xml'))}`);
    console.log(`  ${green('DONE')}  Created ${path.relative(ctx.project, path.join(dir, 'robots.txt'))}`);
  }
};

commands['log'] = async function (args) {
  const o = options(args), ctx = context(o);
  if (o.flags.has('clear')) return commands['log:clear'](args);

  const logDir = path.join(ctx.base, 'storage', 'logs');
  const logFile = path.join(logDir, 'kreft.log');

  if (!fs.existsSync(logFile)) {
    console.log(`  No log file at ${path.relative(ctx.project, logFile)}.`);
    return;
  }

  const content = fs.readFileSync(logFile, 'utf8').trim();
  if (!content) {
    console.log(`  Log file is empty (${path.relative(ctx.project, logFile)}).`);
    return;
  }

  let lines = content.split('\n');
  const levelFilter = o.named?.level || (args.find((a) => a.startsWith('--level=')) ? args.find((a) => a.startsWith('--level=')).split('=')[1] : null);
  if (levelFilter) {
    const up = levelFilter.toUpperCase();
    lines = lines.filter((l) => l.includes('.' + up + ':'));
  }

  const linesCount = Number(args.find((a) => a.startsWith('--lines='))?.split('=')[1] || args.find((a) => /^\d+$/.test(a)) || 50);
  const slice = lines.slice(-linesCount);

  console.log(`\n  Showing last ${slice.length} lines from ${path.relative(ctx.project, logFile)}:\n`);
  for (const line of slice) {
    if (/\.(ERROR|CRITICAL):/.test(line)) console.log('  ' + red(line));
    else if (/\.WARNING:/.test(line)) console.log('  ' + yellow(line));
    else if (/\.(INFO|NOTICE):/.test(line)) console.log('  ' + cyan(line));
    else if (/\.DEBUG:/.test(line)) console.log('  ' + dim(line));
    else console.log('  ' + line);
  }
  console.log('');
};

commands['log:clear'] = async function (args) {
  const o = options(args), ctx = context(o);
  const logDir = path.join(ctx.base, 'storage', 'logs');
  const logFile = path.join(logDir, 'kreft.log');
  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(logFile, '');
  console.log(`  ${green('DONE')}  The log file (${path.relative(ctx.project, logFile)}) has been cleared.`);
};

/* ------------------------------------------------------------------ cache, events, database */
commands['cache:clear'] = async function (args) {
  const o = options(args), ctx = context(o);
  await withApp(o, ctx, async () => {
    await require('./backend/cache.js').Cache.flush();
    fs.rmSync(path.join(ctx.base, 'storage', 'cache'), { recursive: true, force: true });
    console.log(`  ${green('DONE')}  The cache is empty.`);
  });
};
commands['event:list'] = async function (args) {
  const o = options(args), ctx = context(o);
  require('./backend/index.js').installAlias();
  require('./backend/app.js').boot(ctx.base);
  const list = require('./backend/events.js').Event.listeners();
  if (!list.length) return console.log('  No listeners in app/Listeners.');
  for (const e of list) console.log(`  ${e.event}\n${e.listeners.map((l) => '    ⇂ ' + l).join('\n')}`);
};
commands['db:wipe'] = async function (args) {
  const o = options(args), ctx = context(o);
  await withDb(o, ctx, async (db, b) => {
    const dropped = await b.migrator.dropAll(db);
    console.log(`  Dropped ${dropped.length} table${dropped.length === 1 ? '' : 's'}.`);
  });
};
commands['migrate:reset'] = async function (args) {
  const o = options(args), ctx = context(o);
  await withDb(o, ctx, async (db, b) => {
    let total = 0;
    for (;;) {
      const undone = await b.migrator.rollback(db, migrationsOf(o, ctx), (f) => console.log(`  ${green('UNDONE')}  ${f}`));
      if (!undone.length) break;
      total += undone.length;
    }
    if (!total) console.log('  Nothing to undo.');
  });
};
commands['migrate:refresh'] = async function (args) {
  const o = options(args), ctx = context(o);
  await commands['migrate:reset'](args.filter((a) => a !== '--seed'));
  await withDb(o, ctx, async (db, b) => {
    await b.migrator.migrate(db, migrationsOf(o, ctx), (f) => console.log(`  ${green('DONE')}  ${f}`));
    if (o.flags.has('seed')) await runSeed(db, b, ctx, o.class);
  });
};

/* ------------------------------------------------------------------ key, maintenance, about, tinker */
commands['key:generate'] = async function (args) {
  const o = options(args), ctx = context(o);
  const key = 'base64:' + crypto.randomBytes(32).toString('base64');
  if (o.flags.has('show')) return console.log('  ' + key);
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && !o.flags.has('force')) {
    console.warn('  Application is in production! Use --force to generate a new key.');
    return;
  }
  const file = path.join(ctx.project, '.env');
  let text = '';
  if (fs.existsSync(file)) {
    text = fs.readFileSync(file, 'utf8');
  } else {
    const example = path.join(ctx.project, '.env.example');
    if (fs.existsSync(example)) text = fs.readFileSync(example, 'utf8');
  }
  const hasKey = /^APP_KEY=.*$/m.test(text);
  const updated = hasKey
    ? text.replace(/^APP_KEY=.*$/m, () => 'APP_KEY=' + key)
    : text + (text.endsWith('\n') || !text ? '' : '\n') + 'APP_KEY=' + key + '\n';
  fs.writeFileSync(file, updated, { mode: 0o600 });
  process.env.APP_KEY = key;

  // Revoke all active sessions in the database so all users are forced to log in again
  let revokedSessions = 0;
  try {
    const { readConfig } = require('./kreft-config.js');
    const config = readConfig(ctx.base);
    const url = o.db || process.env.DATABASE_URL || config.db;
    if (url) {
      const { connect } = require('./db.js');
      const db = await connect(url, { root: config.dir || ctx.project });
      try {
        const tables = await db.tables();
        if (tables.some((t) => t.name === 'personal_access_tokens')) {
          const res = await db.exec("DELETE FROM personal_access_tokens WHERE type = 'session'");
          revokedSessions += (res && res.changes) || 0;
        }
        if (tables.some((t) => t.name === 'sessions')) {
          const res = await db.exec("DELETE FROM sessions");
          revokedSessions += (res && res.changes) || 0;
        }
      } finally {
        await db.close();
      }
    }
  } catch (_) {}

  // Invalidate any file-based sessions in storage/framework/sessions
  try {
    const sessDir = path.join(ctx.base, 'storage', 'framework', 'sessions');
    if (fs.existsSync(sessDir)) {
      for (const f of fs.readdirSync(sessDir)) {
        if (!f.startsWith('.')) try { fs.unlinkSync(path.join(sessDir, f)); } catch (_) {}
      }
    }
  } catch (_) {}

  console.log(`  ${green('DONE')}  A new APP_KEY [${key}] is set in .env.`);
  console.log(`  ${yellow('REVOKED')} All active user sessions destroyed. Users must log in again.`);
};
commands['key'] = commands['key:generate'];

const downFile = (ctx) => path.join(ctx.base, 'storage', 'framework', 'down.json');
commands.down = function (args) {
  const o = options(args), ctx = context(o);
  const get = (k) => (args.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || null;
  const secret = get('secret') || (o.flags.has('with-secret') ? crypto.randomBytes(12).toString('hex') : null);
  const data = { time: Math.floor(Date.now() / 1000), retry: Number(get('retry')) || null, message: get('message') || 'We are making the site better. Please come back soon.', secret };
  fs.mkdirSync(path.dirname(downFile(ctx)), { recursive: true });
  fs.writeFileSync(downFile(ctx), JSON.stringify(data, null, 2), { mode: 0o600 });
  console.log(`  ${yellow('DOWN')}  The app is in maintenance mode: visitors see a 503 page.${secret ? `\n  You can still use it at: /${secret}  (once; a cookie remembers you)` : ''}\n  Back with: kreft up`);
};
commands.up = function (args) {
  const o = options(args), ctx = context(o);
  if (!fs.existsSync(downFile(ctx))) return console.log('  The app is not in maintenance mode.');
  fs.rmSync(downFile(ctx));
  console.log(`  ${green('UP')}  The app is live again.`);
};
commands.about = function (args) {
  const o = options(args), ctx = context(o);
  const lay = require('./layout.js').layout('.');
  const row = (k, v) => console.log(`  ${k.padEnd(22, '.')} ${v}`);
  const ok = (b) => (b ? green('yes') : dim('no'));
  const has = (p) => fs.existsSync(p);
  console.log('\n  Environment');
  row('Kreft', pkg.version);
  row('Node.js', process.version);
  row('App name', process.env.APP_NAME || '-');
  row('App URL', process.env.APP_URL || '-');
  row('APP_KEY', process.env.APP_KEY ? green('set') : red('missing (kreft key:generate)'));
  row('TypeScript', ok(has(path.join(ctx.project, 'tsconfig.json'))));
  row('Maintenance mode', has(downFile(ctx)) ? yellow('down') : 'live');
  console.log('\n  Drivers');
  row('Database', (process.env.DATABASE_URL || '-').replace(/\/\/([^:@/]+):[^@/]*@/, '//$1:•••@'));
  row('Queue', process.env.QUEUE_CONNECTION || 'database');
  row('Cache', process.env.CACHE_STORE || 'database');
  row('Mail', process.env.MAIL_URL ? 'smtp' : 'log (printed)');
  console.log('\n  Folders');
  row('Frontend', path.relative(process.cwd(), lay.frontend) || '.');
  row('Backend', path.relative(process.cwd(), ctx.base) || '.');
  row('Admin panel', ok(has(path.join(ctx.base, 'admin', 'index.html'))));
  console.log('');
};
commands.tinker = async function (args) {
  const o = options(args), ctx = context(o);
  await withApp(o, ctx, async (db, b) => {
    const repl = require('repl');
    const app = require('./backend/app.js');
    const models = {};
    for (const file of app.filesOf('model')) { try { const M = app.unwrap(require(file)); if (M && M.name) models[M.name] = M; } catch (e) { console.error(`  ${path.basename(file)}: ${e.message}`); } }
    console.log(`  Kreft ${pkg.version} tinker. Your models: ${Object.keys(models).join(', ') || '(none)'}.  await works.  .exit to leave.\n`);
    const r = repl.start({ prompt: '> ', useGlobal: false, preview: true });
    Object.assign(r.context, b, models, { db });
    await new Promise((res) => r.on('exit', res));
  });
};

/* ------------------------------------------------------------------ make:… */
const stub = {
  job: (n) => `const { Job } = require('kreft/server')

// dispatch(new ${n}(…)) puts it on the queue; kreft queue:work (or kreft dev) runs handle()
class ${n} extends Job {
  static tries = 3        // try again after an error, up to 3 times
  static backoff = 10     // seconds between tries

  constructor(data) {
    super()
    this.data = data      // models are stored as their id and read again when the job runs
  }

  async handle() {
    // the work
  }

  failed(error) {
    // after the last try
  }
}

module.exports = ${n}
`,
  event: (n) => `// await event(new ${n}(…)): every listener with static event = '${n}' runs
class ${n} {
  constructor(data) {
    this.data = data
  }
}

module.exports = ${n}
`,
  listener: (n, ev) => `// Runs when the ${ev || 'SomethingHappened'} event is sent: await event(new ${ev || 'SomethingHappened'}(…))
class ${n} {
  static event = '${ev || 'SomethingHappened'}'
  // static queue = true   // run it later, on the queue

  async handle(event) {
    // event.data …
  }
}

module.exports = ${n}
`,
  mail: (n) => `const { Mailable } = require('kreft/server')

// await Mail.to(user.email).send(new ${n}(user))   or   .queue(new ${n}(user))
class ${n} extends Mailable {
  constructor(user) {
    super()
    this.user = user
  }

  build() {
    return this.subject('${n.replace(/Mail$/, '').replace(/([a-z])([A-Z])/g, '$1 $2')}')
      .markdown({
        greeting: \`Hello \${this.user.name}\`,
        lines: ['Thanks for being with us.'],
        action: { text: 'Open the app', url: process.env.APP_URL || '/' },
      })
  }
}

module.exports = ${n}
`,
  notification: (n) => `const { Notification, Url } = require('kreft/server')

// await user.notify(new ${n}(…))
class ${n} extends Notification {
  // static queue = true   // send it later, on the queue

  constructor(data) {
    super()
    this.data = data
  }

  via(notifiable) {
    return ['mail', 'database'] // 'database' needs the notifications table: kreft notifications:table
  }

  toMail(notifiable) {
    return {
      subject: '${n.replace(/([a-z])([A-Z])/g, '$1 $2')}',
      greeting: \`Hello \${notifiable.name}\`,
      lines: ['Something happened.'],
      action: { text: 'Open the app', url: Url.to('/') },
    }
  }

  toDatabase(notifiable) {
    return { message: 'Something happened.' }
  }
}

module.exports = ${n}
`,
  policy: (n, model) => `// Found by itself for the ${model} model: await req.authorize('update', ${snake(model)}), or .middleware('can:update,${snake(model)}')
class ${n} {
  // before(user, ability) { if (user.is_admin) return true }   // admins may do everything

  viewAny(user) { return true }
  view(user, ${snake(model)}) { return true }
  create(user) { return Boolean(user) }
  update(user, ${snake(model)}) { return ${snake(model)}.user_id === user.id }
  delete(user, ${snake(model)}) { return ${snake(model)}.user_id === user.id }
}

module.exports = ${n}
`,
  request: (n) => `const { FormRequest } = require('kreft/server')

// in a controller:  const data = await ${n}.validate(req)
class ${n} extends FormRequest {
  authorize(req) {
    return true // false: 403
  }

  rules(req) {
    return {
      // title: 'required|max:200',
    }
  }

  messages() {
    return {
      // 'title.required': 'Give it a title.',
    }
  }
}

module.exports = ${n}
`,
  resource: (n) => `const { JsonResource } = require('kreft/server')

// return new ${n}(model)   or   ${n}.collection(list)   ({ data: … })
class ${n} extends JsonResource {
  toArray(req) {
    return {
      id: this.id,
      // name: this.name,
      // posts: this.whenLoaded('posts'),
      created_at: this.created_at,
    }
  }
}

module.exports = ${n}
`,
  factory: (n, model, modelReq) => {
    const m = (model || '').toLowerCase();
    let fields = '';
    if (m.includes('category') || m.includes('section') || m.includes('department')) {
      fields = `  name: fake.unique().category(),
  slug: (attrs) => fake.slug(attrs.name),
  description: fake.sentence(),
  is_active: true,`;
    } else if (m.includes('tag')) {
      fields = `  name: fake.unique().tag(),
  slug: (attrs) => fake.slug(attrs.name),`;
    } else if (m.includes('product') || m.includes('item')) {
      fields = `  name: fake.product(),
  slug: (attrs) => fake.slug(attrs.name),
  sku: fake.sku('PRD'),
  price: fake.price(10, 499),
  description: fake.paragraph(),
  is_active: true,`;
    } else if (m.includes('post') || m.includes('article') || m.includes('blog') || m.includes('news')) {
      fields = `  title: fake.sentence(),
  slug: (attrs) => fake.slug(attrs.title),
  content: fake.paragraphs(3),
  is_published: true,`;
    } else if (m.includes('brand') || m.includes('company')) {
      fields = `  name: fake.unique().brand(),
  slug: (attrs) => fake.slug(attrs.name),
  is_active: true,`;
    } else if (m.includes('user') || m.includes('customer') || m.includes('author') || m.includes('member')) {
      fields = `  name: fake.name(),
  email: fake.unique().email(),
  password: 'password',`;
    } else {
      fields = `  name: fake.name(),
  slug: (attrs) => fake.slug(attrs.name),
  is_active: true,`;
    }

    return `const { Factory } = require('kreft/server')
const ${model} = require('${modelReq}')

// await ${model}.factory().count(10).create()
module.exports = Factory.define(${model}, (fake) => ({
${fields}
}))
`;
  },
  rule: (n) => `// In rules: { code: ['required', new ${n}()] }
class ${n} {
  passes(attribute, value, data) {
    return true // false: the message below
  }

  message() {
    return 'The :attribute is invalid.'
  }
}

module.exports = ${n}
`,
  command: (n, sig) => `const { Command } = require('kreft/server')

// kreft ${sig} — your own command
class ${n} extends Command {
  static signature = '${sig} {name?} {--force}'
  static description = 'What ${sig} does'

  async handle() {
    const name = this.argument('name') || 'world'
    this.info(\`Hello \${name}\`)
    // this.option('force'), this.line(…), this.error(…), this.table(rows), await this.ask('Question?')
  }
}

module.exports = ${n}
`,
  observer: (n, model) => `// In app/Models/${model}.js:  static observers = [require('../Observers/${n}')]
class ${n} {
  async creating(${snake(model)}) {}
  async created(${snake(model)}) {}
  async updated(${snake(model)}) {}
  async deleted(${snake(model)}) {}
}

module.exports = ${n}
`,
};
function makeIn(folder, suffix, build, usage) {
  return function (args) {
    const o = options(args), ctx = context(o);
    let { dirs, name } = nested(o._[0]);
    if (!name) return console.error('  ' + usage);
    if (suffix && !name.endsWith(suffix)) name += suffix;
    return build(o, ctx, dirs, name, path.join(ctx.base, ...folder.split('/'), ...dirs, name + '.js'));
  };
}
make.job = makeIn('app/Jobs', '', (o, c, d, n, f) => write(f, stub.job(n)), 'kreft make:job SendWelcomeEmail');
make.event = makeIn('app/Events', '', (o, c, d, n, f) => write(f, stub.event(n)), 'kreft make:event OrderShipped');
make.listener = makeIn('app/Listeners', '', (o, c, d, n, f) => write(f, stub.listener(n, o.event)), 'kreft make:listener SendShipmentNotice --event OrderShipped');
make.mail = makeIn('app/Mail', 'Mail', (o, c, d, n, f) => write(f, stub.mail(n)), 'kreft make:mail WelcomeMail');
make.notification = makeIn('app/Notifications', '', (o, c, d, n, f) => write(f, stub.notification(n)), 'kreft make:notification InvoicePaid');
make.policy = makeIn('app/Policies', 'Policy', (o, c, d, n, f) => write(f, stub.policy(n, o.model || n.replace(/Policy$/, ''))), 'kreft make:policy PostPolicy [--model Post]');
make.request = make.request || makeIn('app/Http/Requests', 'Request', (o, c, d, n, f) => write(f, stub.request(n)), 'kreft make:request StorePostRequest');
make.resource = make.resource || makeIn('app/Http/Resources', 'Resource', (o, c, d, n, f) => write(f, stub.resource(n)), 'kreft make:resource PostResource');
make.rule = make.rule || makeIn('app/Rules', '', (o, c, d, n, f) => write(f, stub.rule(n)), 'kreft make:rule Uppercase');
make.observer = makeIn('app/Observers', 'Observer', (o, c, d, n, f) => write(f, stub.observer(n, o.model || n.replace(/Observer$/, ''))), 'kreft make:observer PostObserver [--model Post]');
make.command = makeIn('app/Console/Commands', '', (o, c, d, n, f) => write(f, stub.command(n, o.command || n.replace(/Command$/, '').replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase().replace(/-/, ':'))), 'kreft make:command SendReport [--command report:send]');
make.factory = function (args) {
  const o = options(args), ctx = context(o);
  let { name } = nested(o._[0]);
  if (!name) return console.error('  kreft make:factory PostFactory [--model Post]');
  if (!name.endsWith('Factory')) name += 'Factory';
  const model = o.model ? nested(o.model) : { dirs: [], name: name.replace(/Factory$/, '') };
  write(path.join(ctx.base, 'database', 'factories', name + '.js'), stub.factory(name, model.name, '../../app/Models/' + [...model.dirs, model.name].join('/')));
};
for (const k of ['job', 'event', 'listener', 'mail', 'notification', 'policy', 'request', 'resource', 'rule', 'observer', 'command', 'factory']) commands['make:' + k] = make[k];

/* ------------------------------------------------------------------ your own commands */
// 'report:send {user} {name?} {--force} {--days=7}' → { name: 'report:send', args: [...], opts: [...] }
function parseSignature(sig) {
  const name = sig.trim().split(/\s+/)[0];
  const args = [], opts = [];
  for (const m of sig.matchAll(/\{([^}]+)\}/g)) {
    const t = m[1].trim().split(':')[0].trim();
    if (t.startsWith('--')) { const [k, d] = t.slice(2).split('='); opts.push({ name: k.replace(/\|.*$/, ''), def: d === undefined ? null : d, takes: t.includes('=') }); }
    else args.push({ name: t.replace(/[?*]$/, '').replace(/=.*$/, ''), optional: /[?]$/.test(t) || t.includes('='), many: t.endsWith('*'), def: (t.split('=')[1] || null) });
  }
  return { name, args, opts };
}
const { Command } = require('./backend/command.js');
function customCommands(base) {
  const dir = path.join(base, 'app', 'Console', 'Commands');
  const out = [];
  if (!fs.existsSync(dir)) return out;
  require('./backend/index.js').installAlias();
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else if (/\.(c?js|[mc]?ts)$/.test(e.name) && !e.name.endsWith('.d.ts')) {
        try { let C = require(f); if (C && C.default) C = C.default; if (C && C.signature) out.push({ C, ...parseSignature(C.signature), file: f }); }
        catch (e2) { console.error(`  ${path.relative(process.cwd(), f)}: ${e2.message}`); }
      }
    }
  };
  walk(dir);
  return out;
}
async function runCustom(name, args) {
  const o = options(args), ctx = context(o);
  const found = customCommands(ctx.base).find((c) => c.name === name);
  if (!found) return false;
  const positional = args.filter((a) => !a.startsWith('-'));
  const values = {}, opts = {};
  found.args.forEach((a, i) => { values[a.name] = a.many ? positional.slice(i) : positional[i] ?? a.def ?? null; });
  const missing = found.args.find((a) => !a.optional && (values[a.name] == null || (a.many && !values[a.name].length)));
  if (missing) { console.error(`  Missing the "${missing.name}" argument.  kreft ${found.C.signature.replace(/\s*\{--[^}]+\}/g, '')}`); process.exitCode = 1; return true; }
  for (const op of found.opts) {
    const given = args.find((a) => a === '--' + op.name || a.startsWith(`--${op.name}=`));
    opts[op.name] = op.takes ? (given && given.includes('=') ? given.split('=').slice(1).join('=') : op.def) : Boolean(given);
  }
  await withApp(o, ctx, async () => {
    const cmd = new found.C();
    Object.defineProperty(cmd, '__args', { value: values });
    Object.defineProperty(cmd, '__opts', { value: opts });
    await cmd.handle();
  });
  return true;
}
// Schedule.command('cache:clear') and this.call('…'): one command line
async function runCommand(line) {
  const [name, ...args] = String(line).trim().split(/\s+/);
  if (commands[name]) return commands[name](args);
  if (!(await runCustom(name, args))) throw new Error(`Unknown command "${name}".`);
}
commands.list = function (args) {
  const o = options(args), ctx = context(o);
  const builtIn = Object.keys(commands).filter((c) => !['list', 'help', '--help', '-h', '--version', '-v'].includes(c)).sort();
  const groups = {};
  for (const c of builtIn) (groups[c.includes(':') ? c.split(':')[0] : ''] = groups[c.includes(':') ? c.split(':')[0] : ''] || []).push(c);
  console.log(`\n  Kreft ${pkg.version}\n\n  Commands:`);
  console.log('    new  dev  serve  build  update  db  vscode   (kreft help for their options)');
  console.log('    ' + (groups[''] || []).join('  '));
  for (const [g, list] of Object.entries(groups)) if (g) console.log(`  ${g}\n    ${list.join('  ')}`);
  const mine = customCommands(ctx.base);
  if (mine.length) {
    console.log('  yours (app/Console/Commands)');
    mine.forEach((c) => console.log(`    ${c.name.padEnd(24)} ${dim(c.C.description || '')}`));
  }
  console.log('');
};
commands.env = function () { console.log(`  The app runs in the ${process.env.APP_ENV || 'local'} environment.`); };

module.exports = { Command, runCommand, runCustom, customCommands, parseSignature, withApp, tableStubs };
