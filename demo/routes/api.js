// The demo's API: every address here starts with /api.
// som dev --backend demo loads it (see package.json). List them: node bin/som.js route:list --backend demo
const { Route, DB, Cache, config, getMemoryStats } = require('somjs/server')
const TaskController = require('../app/Http/Controllers/TaskController')

// GET, POST /api/tasks · GET, PUT, PATCH /api/tasks/{task}  (TaskController)
Route.apiResource('tasks', TaskController, { except: ['destroy'] }).middleware('throttle:120,1')

// DELETE /api/tasks/{task} only with the demo key: app/Http/Middleware/DemoKey.js
Route.middleware('demo-key').group(() => {
  Route.delete('/tasks/{task}', [TaskController, 'destroy']).name('tasks.destroy')
})

// POST /api/tasks/complete-all — atomic batch update inside a DB.transaction + Cache lock
Route.post('/tasks/complete-all', async () => {
  const Task = require('../app/Models/Task')
  await Cache.lock('tasks:bulk-complete', 5).block(2, async () => {
    await DB.transaction(async () => {
      await Task.where('done', false).update({ done: true })
    })
  })
  await Cache.forget('tasks:summary')
  return { ok: true, total: await Task.count(), done: await Task.where('done', true).count() }
})

// GET /api/tasks-summary — model counts + runtime config & memory stats
Route.get('/tasks-summary', async () => {
  const Task = require('../app/Models/Task')
  const total = await Task.count()
  const done = await Task.where('done', true).count()
  const mem = getMemoryStats()
  return {
    total,
    done,
    driver: config('database.default', 'sqlite'),
    heapMB: mem.heapUsedMB,
  }
})
