// Thrown by services/controllers for expected, client-facing failures
// (validation, not-found, unauthorized, etc). Anything else thrown is
// treated as an unexpected 500 by the centralized error handler.
export class ApiError extends Error {
  constructor(statusCode, message, code = 'ERROR', details) {
    super(message)
    this.name = 'ApiError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }

  static badRequest(message, code = 'BAD_REQUEST', details) {
    return new ApiError(400, message, code, details)
  }

  static unauthorized(message = 'Unauthorized', code = 'UNAUTHORIZED') {
    return new ApiError(401, message, code)
  }

  static forbidden(message = 'Forbidden', code = 'FORBIDDEN') {
    return new ApiError(403, message, code)
  }

  static notFound(message = 'Not found', code = 'NOT_FOUND') {
    return new ApiError(404, message, code)
  }

  static conflict(message, code = 'CONFLICT') {
    return new ApiError(409, message, code)
  }
}
