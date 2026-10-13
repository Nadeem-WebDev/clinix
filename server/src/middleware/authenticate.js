import { verifyAuthToken, AUTH_COOKIE_NAME } from '../utils/jwt.js'
import { User } from '../models/User.js'
import { Clinic, CLINIC_SUSPENDED_MESSAGE } from '../models/Clinic.js'
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

    // A token from before the last password change is a session that
    // change was meant to end (another device, or someone who saw it).
    // Tokens from before this field existed carry no `sv` - treat as 0.
    if ((payload.sv ?? 0) !== (user.sessionVersion ?? 0)) {
      throw ApiError.unauthorized('Your password was changed. Please log in again.', 'PASSWORD_CHANGED')
    }

    // A suspended clinic's sessions end at once, not at token expiry. A 401
    // so the app treats it as signed out and shows the login page.
    if (!(await Clinic.exists({ _id: user.clinicId, active: true }))) {
      throw ApiError.unauthorized(CLINIC_SUSPENDED_MESSAGE, 'CLINIC_SUSPENDED')
    }

    req.user = user
    req.clinicId = String(user.clinicId)
    return next()
  } catch (err) {
    return next(err)
  }
}
