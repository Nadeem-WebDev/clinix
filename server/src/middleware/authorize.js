import { ApiError } from '../utils/ApiError.js'

// Role gate. Must run after `authenticate`. Usage: authorize('admin'),
// authorize('admin', 'doctor'), etc.
export function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized('Not authenticated'))
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(ApiError.forbidden('You do not have permission to perform this action'))
    }
    return next()
  }
}
