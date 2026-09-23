import { verifyAuthToken, AUTH_COOKIE_NAME } from '../utils/jwt.js'
import { User } from '../models/User.js'
import { ApiError } from '../utils/ApiError.js'

// Establishes req.user and req.clinicId for every downstream handler.
// Both are derived ONLY from the verified JWT (in an httpOnly cookie) plus
// a fresh DB lookup - never from any client-supplied field (body/query/
// params). Routes and services must always scope queries by req.clinicId,
// never by a clinicId read from the request payload.
export async function authenticate(req, res, next) {
  try {
    const token = req.cookies?.[AUTH_COOKIE_NAME]
    if (!token) {
      throw ApiError.unauthorized('Not authenticated')
    }

    let payload
    try {
      payload = verifyAuthToken(token)
    } catch {
      throw ApiError.unauthorized('Session expired or invalid, please log in again')
    }

    // Re-fetch (rather than trusting the token payload) so a disabled
    // account or role change takes effect immediately, not at token expiry.
    const user = await User.findById(payload.sub)
    if (!user || !user.active) {
      throw ApiError.unauthorized('Account is disabled or no longer exists')
    }

    req.user = user
    req.clinicId = String(user.clinicId)
    return next()
  } catch (err) {
    return next(err)
  }
}
