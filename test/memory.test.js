const test = require('node:test');
const assert = require('node:assert');
const gc = require('../bin/backend/gc.js');

test('memory manager: pressure handlers, cleanup, report and alerts', () => {
  gc.startAutoGarbageCollector({ thresholdMB: 1, intervalMs: 3600000, alertAfter: 2, alertCooldownMs: 1 });
  let trimmed = 0;
  gc.onMemoryPressure('t', (fraction) => { trimmed++; assert.ok(fraction > 0 && fraction <= 1); return 3; });
  const alerts = [];
  gc.onMemoryAlert((a) => alerts.push(a));
  const r = gc.checkMemory(); // heap is far above 1 MB: cleanup runs
  assert.strictEqual(r.action, 'cleanup-threshold');
  assert.strictEqual(trimmed, 1);
  gc.checkMemory();
  const rep = gc.getMemoryReport();
  assert.strictEqual(rep.cleanups, 2);
  assert.strictEqual(rep.evictedEntries, 6);
  assert.strictEqual(rep.history.length, 2);
  assert.ok(alerts.some((a) => a.type === 'memory-high'), 'stays high -> alert');
  gc.stopAutoGarbageCollector();
});

test('memory cache store: LRU cap and trim', async () => {
  process.env.CACHE_STORE = 'memory';
  process.env.CACHE_MEMORY_MAX = '3';
  delete require.cache[require.resolve('../bin/backend/cache.js')];
  const { Cache } = require('../bin/backend/cache.js');
  await Cache.put('a', 1); await Cache.put('b', 2); await Cache.put('c', 3);
  assert.strictEqual(await Cache.get('a'), 1); // a becomes most recently used
  await Cache.put('d', 4); // evicts b, the least recently used
  assert.strictEqual(await Cache.get('b', null), null);
  assert.strictEqual(await Cache.get('a'), 1);
  assert.strictEqual(await Cache.get('d'), 4);
});
