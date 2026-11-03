const { response } = require('somjs/server')
const Task = require('../../Models/Task')
const StoreTaskRequest = require('../Requests/StoreTaskRequest')
const UpdateTaskRequest = require('../Requests/UpdateTaskRequest')

class TaskController {
  // GET /api/tasks?priority=high
  async index(req) {
    return Task.query()
      .when(req.input('priority'), (q, p) => q.where('priority', p))
      .orderBy('done')
      .orderByDesc('id')
      .get()
  }

  // POST /api/tasks   (422 with { message, errors } when a rule fails)
  async store(req) {
    const data = await StoreTaskRequest.validate(req)
    return response(await Task.create(data), 201)
  }

  // GET /api/tasks/5
  async show(req, id) {
    return Task.findOrFail(id)
  }

  // PATCH /api/tasks/5
  async update(req, id) {
    const task = await Task.findOrFail(id)
    const data = await UpdateTaskRequest.validate(req)
    return task.update(data)
  }

  // DELETE /api/tasks/5   (only after the DemoKey middleware let the request through)
  async destroy(req, id) {
    const task = await Task.findOrFail(id)
    await task.delete()
  }
}

module.exports = TaskController
