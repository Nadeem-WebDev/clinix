import { ApiError } from '../utils/ApiError.js'
import { isProduction } from '../config/env.js'

export function notFoundHandler(req, res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`))
}

// Centralized error handler. Never leaks stack traces, DB connection
// details, or filesystem paths to the client - those are logged
// server-side only (console for now; wire to a real logger later).
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const isApiError = err instanceof ApiError
  const statusCode = isApiError ? err.statusCode : 500
  const code = isApiError ? err.code : 'INTERNAL_ERROR'
  const message =
    isApiError || !isProduction ? err.message : 'Something went wrong'

  if (!isApiError) {
    console.error(err)
  }

  res.status(statusCode).json({
    success: false,
    message,
    code,
    ...(isApiError && err.details ? { details: err.details } : {}),
  })
}
