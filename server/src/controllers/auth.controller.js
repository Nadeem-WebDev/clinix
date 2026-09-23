import * as authService from '../services/auth.service.js'
import { sendSuccess } from '../utils/ApiResponse.js'
import {
  signAuthToken,
  authCookieOptions,
  clearAuthCookieOptions,
  AUTH_COOKIE_NAME,
} from '../utils/jwt.js'
import { writeAuditLog } from '../utils/audit.js'

export async function registerClinicHandler(req, res, next) {
  try {
    const { clinic, user } = await authService.registerClinic(req.body)

    const token = signAuthToken({ userId: user._id, clinicId: clinic._id, role: user.role })
    res.cookie(AUTH_COOKIE_NAME, token, authCookieOptions())

    await writeAuditLog({
      clinicId: clinic._id,
      userId: user._id,
      action: 'CLINIC_REGISTERED',
      resourceType: 'Clinic',
      resourceId: clinic._id,
      ipAddress: req.ip,
    })

    return sendSuccess(res, {
      status: 201,
      message: 'Clinic and admin account created',
      data: { clinic, user },
    })
  } catch (err) {
    return next(err)
  }
}

export async function loginHandler(req, res, next) {
  try {
    const user = await authService.login(req.body)

    const token = signAuthToken({ userId: user._id, clinicId: user.clinicId, role: user.role })
    res.cookie(AUTH_COOKIE_NAME, token, authCookieOptions())

    await writeAuditLog({
      clinicId: user.clinicId,
      userId: user._id,
      action: 'LOGIN',
      resourceType: 'User',
      resourceId: user._id,
      ipAddress: req.ip,
    })

    return sendSuccess(res, { message: 'Logged in', data: { user } })
  } catch (err) {
    return next(err)
  }
}

export async function logoutHandler(req, res, next) {
  try {
    if (req.user) {
      await writeAuditLog({
        clinicId: req.user.clinicId,
        userId: req.user._id,
        action: 'LOGOUT',
        resourceType: 'User',
        resourceId: req.user._id,
        ipAddress: req.ip,
      })
    }
    res.clearCookie(AUTH_COOKIE_NAME, clearAuthCookieOptions())
    return sendSuccess(res, { message: 'Logged out' })
  } catch (err) {
    return next(err)
  }
}

export async function meHandler(req, res, next) {
  try {
    return sendSuccess(res, { data: { user: req.user } })
  } catch (err) {
    return next(err)
  }
}
