const { FormRequest } = require('kreft/server')

class LoginRequest extends FormRequest {
  /**
   * Determine if the user is authorized to make this request.
   */
  authorize() {
    return true
  }

  /**
   * Get the validation rules that apply to the request.
   */
  rules() {
    return {
      email: 'required|string|email|max:255',
      password: 'required|string|max:255',
      remember: 'sometimes|boolean',
    }
  }

  /**
   * Custom error messages for validation failures.
   */
  messages() {
    return {
      'email.required': 'Please enter your email address.',
      'email.email': 'Please enter a valid email address.',
      'password.required': 'Please enter your password.',
    }
  }

  /**
   * Prepare data for validation (trim and lower-case email).
   */
  prepareForValidation(data) {
    return {
      ...data,
      email: typeof data.email === 'string' ? data.email.trim().toLowerCase() : data.email,
    }
  }
}

module.exports = LoginRequest

