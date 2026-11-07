/*
 * Kreft Memory Manager (Auto GC + watchdog)
 *
 *   - Adaptive GC: a cleanup runs when the heap passes the threshold OR when it keeps growing
 *     (trend over the last samples) while already past 60% of the threshold.
 *   - Smart eviction: caches register a handler (onMemoryPressure) and drop their least recently
 *     used entries, a fraction at a time, instead of being flushed whole.
 *   - Leak detection: after each real GC the heap "floor" is recorded; a floor that keeps rising
 *     across collections is reported as a suspected leak.
 *   - Alerts: onMemoryAlert(fn) is called when memory stays high despite cleaning, or a leak is suspected.
 *   - Report: getMemoryReport() returns samples, GC count, evictions, leak state and alerts.
 *
 * Env: AUTO_GC_THRESHOLD_MB (250), AUTO_GC_INTERVAL_MS (30000), AUTO_GC_GROWTH_MB_PER_MIN (20),
 *      AUTO_GC_ALERT_AFTER (3 checks), AUTO_GC_LEAK_RISE_MB (20). `--gc` / AUTO_GC=1 exposes global.gc.
 */
const MB = 1024 * 1024;
const HISTORY_MAX = 120;

let gcTimer = null;
let config = null;
let observer = null;

const history = [];
const pressureHandlers = new Map();
const alertListeners = new Set();
const floors = [];
const state = freshState();

function freshState() {
  return {
    startedAt: null, checks: 0, cleanups: 0, gcRuns: 0, v8Collections: 0, reclaimedMB: 0,
    evicted: 0, overStreak: 0, alerts: [], lastAlertAt: 0, leak: { suspected: false, riseMB: 0, floorsMB: [] },
  };
}

const round = (n) => +(n).toFixed(2);

/** Register a handler called under memory pressure: fn(fraction) → number of entries dropped. */
function onMemoryPressure(name, fn) {
  pressureHandlers.set(name, fn);
  return () => pressureHandlers.delete(name);
}

/** Be told when memory stays high after cleaning, or a leak looks likely. fn(alert) */
function onMemoryAlert(fn) {
  alertListeners.add(fn);
  return () => alertListeners.delete(fn);
}

// Slope of the heap in MB per minute over the most recent samples (least squares); null with too few samples.
function trendMBPerMin(n = 10) {
  const pts = history.slice(-n);
  if (pts.length < 4) return null;
  const t0 = pts[0].t;
  const xs = pts.map((p) => (p.t - t0) / 60000);
  const ys = pts.map((p) => p.heapUsedMB);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  return den === 0 ? null : round(num / den);
}

function emitAlert(type, message, extra = {}) {
  const now = Date.now();
  if (now - state.lastAlertAt < config.alertCooldownMs) return;
  state.lastAlertAt = now;
  const alert = { type, message, at: new Date(now).toISOString(), ...getMemoryStats(), ...extra };
  state.alerts.push(alert);
  if (state.alerts.length > 20) state.alerts.shift();
  for (const fn of alertListeners) { try { fn(alert); } catch (_) {} }
  if (!alertListeners.size) console.warn(`  [Kreft Memory] ${message}`);
}

function runCleanup(fraction) {
  state.cleanups++;
  for (const fn of pressureHandlers.values()) {
    try { const n = Number(fn(fraction)); if (n > 0) state.evicted += n; } catch (_) {}
  }
  let gcRan = false;
  if (typeof global.gc === 'function') { global.gc(); state.gcRuns++; gcRan = true; }
  return gcRan;
}

function trackLeak() {
  const f = floors.slice(-6);
  const rising = f.length >= 4 && f.every((v, i) => i === 0 || v >= f[i - 1] - 0.5);
  const rise = f.length ? f[f.length - 1] - f[0] : 0;
  state.leak = { suspected: rising && rise >= config.leakRiseMB, riseMB: round(rise), floorsMB: f.map(round) };
  if (state.leak.suspected) {
    emitAlert('memory-leak', `Possible memory leak: the heap after GC rose ${round(rise)} MB over the last ${f.length} collections.`, { leak: state.leak });
  }
}

/** One check (the timer calls this; exported so it can be driven directly). */
function checkMemory() {
  const mem = process.memoryUsage();
  const heapUsedMB = mem.heapUsed / MB;
  history.push({ t: Date.now(), heapUsedMB: round(heapUsedMB), rssMB: round(mem.rss / MB) });
  if (history.length > HISTORY_MAX) history.shift();
  state.checks++;

  const trend = trendMBPerMin();
  const over = heapUsedMB > config.thresholdMB;
  const growing = trend != null && trend > config.growthMBPerMin && heapUsedMB > config.thresholdMB * 0.6;
  if (!over && !growing) { state.overStreak = 0; return { action: 'none', heapUsedMB: round(heapUsedMB), trend }; }

  const before = heapUsedMB;
  const gcRan = runCleanup(over ? 0.75 : 0.5);
  const after = process.memoryUsage().heapUsed / MB;
  if (gcRan) {
    state.reclaimedMB = round(state.reclaimedMB + Math.max(0, before - after));
    floors.push(after);
    if (floors.length > 12) floors.shift();
    trackLeak();
  }
  if (config.log) console.log(`  [Kreft GC] ${over ? 'over threshold' : 'growing ' + trend + ' MB/min'}: ${round(before)} → ${round(after)} MB.`);

  if (after > config.thresholdMB * 0.9) {
    state.overStreak++;
    if (state.overStreak >= config.alertAfter) {
      emitAlert('memory-high', `Memory stays high after cleaning: ${round(after)} MB (threshold ${config.thresholdMB} MB) for ${state.overStreak} checks in a row.`, { overStreak: state.overStreak });
    }
  } else {
    state.overStreak = 0;
  }
  return { action: over ? 'cleanup-threshold' : 'cleanup-trend', beforeMB: round(before), afterMB: round(after), trend };
}

function startAutoGarbageCollector(options = {}) {
  if (gcTimer) return;
  config = {
    thresholdMB: Number(options.thresholdMB || process.env.AUTO_GC_THRESHOLD_MB) || 250,
    intervalMs: Number(options.intervalMs || process.env.AUTO_GC_INTERVAL_MS) || 30000,
    growthMBPerMin: Number(options.growthMBPerMin || process.env.AUTO_GC_GROWTH_MB_PER_MIN) || 20,
    alertAfter: Number(options.alertAfter || process.env.AUTO_GC_ALERT_AFTER) || 3,
    leakRiseMB: Number(options.leakRiseMB || process.env.AUTO_GC_LEAK_RISE_MB) || 20,
    alertCooldownMs: Number(options.alertCooldownMs) || 10 * 60 * 1000,
    log: options.log || false,
  };
  Object.assign(state, freshState(), { startedAt: new Date().toISOString() });
  history.length = 0;
  floors.length = 0;

  // Purge migrator file caches under pressure (always present)
  onMemoryPressure('migrator', () => {
    const migrator = require('./migrator.js');
    if (migrator && typeof migrator.forgetProjectFiles === 'function') migrator.forgetProjectFiles(process.cwd());
    return 0;
  });

  try {
    const { PerformanceObserver } = require('perf_hooks');
    observer = new PerformanceObserver((list) => { state.v8Collections += list.getEntries().length; });
    observer.observe({ entryTypes: ['gc'] });
  } catch (_) { observer = null; }

  gcTimer = setInterval(() => { try { checkMemory(); } catch (_) {} }, config.intervalMs);
  if (gcTimer.unref) gcTimer.unref(); // Don't hold node process open
}

function stopAutoGarbageCollector() {
  if (gcTimer) { clearInterval(gcTimer); gcTimer = null; }
  if (observer) { try { observer.disconnect(); } catch (_) {} observer = null; }
  pressureHandlers.delete('migrator');
}

function getMemoryStats() {
  const mem = process.memoryUsage();
  return {
    rssMB: +(mem.rss / MB).toFixed(2),
    heapTotalMB: +(mem.heapTotal / MB).toFixed(2),
    heapUsedMB: +(mem.heapUsed / MB).toFixed(2),
    externalMB: +(mem.external / MB).toFixed(2),
    gcExposed: typeof global.gc === 'function',
  };
}

/** Everything a dashboard or alert needs, as plain JSON. */
function getMemoryReport() {
  return {
    ...getMemoryStats(),
    running: !!gcTimer,
    config,
    startedAt: state.startedAt,
    checks: state.checks,
    cleanups: state.cleanups,
    gcRuns: state.gcRuns,
    v8Collections: state.v8Collections,
    reclaimedMB: state.reclaimedMB,
    evictedEntries: state.evicted,
    trendMBPerMin: trendMBPerMin(),
    overStreak: state.overStreak,
    leak: state.leak,
    alerts: state.alerts.slice(),
    history: history.slice(),
  };
}

/** Writes a V8 heap snapshot (open it in Chrome DevTools → Memory) to find what is holding memory. Returns the file path. */
function writeHeapSnapshot(file) {
  const path = require('path');
  const dir = path.join(process.cwd(), 'storage', 'logs');
  const target = file || path.join(dir, `heap-${Date.now()}.heapsnapshot`);
  require('fs').mkdirSync(path.dirname(target), { recursive: true });
  return require('v8').writeHeapSnapshot(target);
}

module.exports = {
  startAutoGarbageCollector,
  stopAutoGarbageCollector,
  getMemoryStats,
  getMemoryReport,
  onMemoryPressure,
  onMemoryAlert,
  writeHeapSnapshot,
  checkMemory,
};
