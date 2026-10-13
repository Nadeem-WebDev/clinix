import { verifyPlatformToken, PLATFORM_COOKIE_NAME } from '../utils/jwt.js'
import { PlatformAdmin } from '../models/PlatformAdmin.js'
import { ApiError } from '../utils/ApiError.js'

// Gate for every /platform route except login. Sets req.platformAdmin - and
// deliberately not req.user/req.clinicId: a platform admin is not a member
// of any clinic, so no clinic-scoped handler can run with this session.
export async function authenticatePlatform(req, res, next) {
  try {
    const token = req.cookies?.[PLATFORM_COOKIE_NAME]
    if (!token) throw ApiError.unauthorized('Not authenticated')

    let payload
    try {
      payload = verifyPlatformToken(token)
    } catch {
      throw ApiError.unauthorized('Session expired or invalid, please log in again')
    }

    const admin = await PlatformAdmin.findById(payload.sub)
    if (!admin || !admin.active || (payload.sv ?? 0) !== (admin.sessionVersion ?? 0)) {
      throw ApiError.unauthorized('Session expired or invalid, please log in again')
    }

    req.platformAdmin = admin
    return next()
  } catch (err) {
    return next(err)
  }
}
