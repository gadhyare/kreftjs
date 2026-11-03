const { FormRequest } = require('kreft/server')

class StoreTaskRequest extends FormRequest {
  /**
   * Determine if the user is authorized to make this request.
   */
  authorize() {
    return true
  }

  /**
   * Validation rules for creating a new Task.
   */
  rules() {
    return {
      title: 'required|min:3|max:120|unique:tasks,title',
      priority: 'required|in:low,normal,high',
    }
  }

  /**
   * Custom validation error messages.
   */
  messages() {
    return {
      'title.required': 'A task title is required.',
      'title.min': 'Title must be at least 3 characters long.',
      'title.unique': 'A task with this title already exists.',
      'priority.in': 'Priority must be low, normal, or high.',
    }
  }
}

module.exports = StoreTaskRequest

