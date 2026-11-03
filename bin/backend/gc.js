/*
 * Kreft Auto Garbage Collector & Memory Watchdog
 *
 * Keeps Kreft server instances blazing fast and lightweight, preventing V8 heap
 * bloating during continuous development and production traffic.
 */
let gcTimer = null;
let lastMemoryUsage = null;

function startAutoGarbageCollector(options = {}) {
  if (gcTimer) return;
  const thresholdMB = Number(options.thresholdMB || process.env.AUTO_GC_THRESHOLD_MB) || 250;
  const intervalMs = Number(options.intervalMs || process.env.AUTO_GC_INTERVAL_MS) || 30000;
  const log = options.log || false;

  gcTimer = setInterval(() => {
    try {
      const mem = process.memoryUsage();
      lastMemoryUsage = mem;
      const heapUsedMB = mem.heapUsed / (1024 * 1024);

      if (heapUsedMB > thresholdMB) {
        // 1. Purge migrator file caches
        try {
          const migrator = require('./migrator.js');
          if (migrator && typeof migrator.forgetProjectFiles === 'function') {
            migrator.forgetProjectFiles(process.cwd());
          }
        } catch (_) {}

        // 2. Trigger V8 Garbage Collection if exposed (--expose-gc)
        if (typeof global.gc === 'function') {
          global.gc();
          if (log) {
            const after = process.memoryUsage();
            const reclaimedMB = (heapUsedMB - after.heapUsed / (1024 * 1024)).toFixed(1);
            console.log(`  [Kreft GC] Auto-collected ${reclaimedMB} MB heap memory.`);
          }
        }
      }
    } catch (_) {}
  }, intervalMs);

  if (gcTimer.unref) gcTimer.unref(); // Don't hold node process open
}

function stopAutoGarbageCollector() {
  if (gcTimer) {
    clearInterval(gcTimer);
    gcTimer = null;
  }
}

function getMemoryStats() {
  const mem = process.memoryUsage();
  return {
    rssMB: +(mem.rss / (1024 * 1024)).toFixed(2),
    heapTotalMB: +(mem.heapTotal / (1024 * 1024)).toFixed(2),
    heapUsedMB: +(mem.heapUsed / (1024 * 1024)).toFixed(2),
    externalMB: +(mem.external / (1024 * 1024)).toFixed(2),
    gcExposed: typeof global.gc === 'function',
  };
}

module.exports = {
  startAutoGarbageCollector,
  stopAutoGarbageCollector,
  getMemoryStats,
};
