const { FormRequest } = require('kreftjs/server')

class UpdateTaskRequest extends FormRequest {
  /**
   * Determine if the user is authorized to make this request.
   */
  authorize() {
    return true
  }

  /**
   * Validation rules for updating an existing Task.
   */
  rules(req) {
    const id = req && req.params ? req.params.id : ''
    return {
      title: `sometimes|required|min:3|max:120|unique:tasks,title,${id}`,
      priority: 'sometimes|in:low,normal,high',
      done: 'sometimes|boolean',
    }
  }

  /**
   * Custom validation error messages.
   */
  messages() {
    return {
      'title.min': 'Title must be at least 3 characters long.',
      'priority.in': 'Priority must be low, normal, or high.',
    }
  }
}

module.exports = UpdateTaskRequest

