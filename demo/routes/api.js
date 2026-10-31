// The demo's API: every address here starts with /api.
// som dev --backend demo loads it (see package.json). List them: node bin/som.js route:list --backend demo
const { Route } = require('somjs/server')
const TaskController = require('../app/Http/Controllers/TaskController')

// GET, POST /api/tasks · GET, PUT, PATCH /api/tasks/{task}  (TaskController)
Route.apiResource('tasks', TaskController, { except: ['destroy'] }).middleware('throttle:120,1')

// DELETE /api/tasks/{task} only with the demo key: app/Http/Middleware/DemoKey.js
Route.middleware('demo-key').group(() => {
  Route.delete('/tasks/{task}', [TaskController, 'destroy']).name('tasks.destroy')
})

// a closure route, and a query on the model
Route.get('/tasks-summary', async () => {
  const Task = require('../app/Models/Task')
  return { total: await Task.count(), done: await Task.where('done', true).count() }
})
