import { ApiError } from '../utils/ApiError.js'

// Validates req.body against a Zod schema, replaces req.body with the
// parsed (and coerced/trimmed) result, or throws a 400 with field-level
// details. Every mutating route should validate its input this way -
// never rely on frontend validation alone.
export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }))
      return next(ApiError.badRequest('Validation failed', 'VALIDATION_ERROR', details))
    }
    req.body = result.data
    return next()
  }
}

// Same as validateBody, but for req.query (used for search/pagination
// params). Express makes req.query a getter-only property on newer
// versions, so we store the parsed result separately rather than
// reassigning req.query itself.
export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query)
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }))
      return next(ApiError.badRequest('Invalid query parameters', 'VALIDATION_ERROR', details))
    }
    req.validatedQuery = result.data
    return next()
  }
}

// Same again, for req.params. Only needed where a path segment is a
// lookup key in its own right (the public /q/:slug route) rather than an
// ObjectId the service already validates - Express gives params no typing
// at all, so an unvalidated one reaches the query layer as raw user input.
export function validateParams(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.params)
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }))
      return next(ApiError.badRequest('Invalid path parameters', 'VALIDATION_ERROR', details))
    }
    req.validatedParams = result.data
    return next()
  }
}
