import * as platformService from '../services/platform.service.js'
import { sendSuccess } from '../utils/ApiResponse.js'
import {
  signPlatformToken,
  platformCookieOptions,
  clearPlatformCookieOptions,
  PLATFORM_COOKIE_NAME,
} from '../utils/jwt.js'

export async function loginHandler(req, res, next) {
  try {
    const admin = await platformService.login(req.body)
    const token = signPlatformToken({ adminId: admin._id, sessionVersion: admin.sessionVersion })
    res.cookie(PLATFORM_COOKIE_NAME, token, platformCookieOptions())
    await platformService.recordPlatformAction({ admin, action: 'PLATFORM_LOGIN', ipAddress: req.ip })
    return sendSuccess(res, { message: 'Logged in', data: { admin } })
  } catch (err) {
    return next(err)
  }
}

export function logoutHandler(req, res) {
  res.clearCookie(PLATFORM_COOKIE_NAME, clearPlatformCookieOptions())
  return sendSuccess(res, { message: 'Logged out' })
}

export function meHandler(req, res) {
  return sendSuccess(res, { data: { admin: req.platformAdmin } })
}

export async function overviewHandler(req, res, next) {
  try {
    return sendSuccess(res, { data: await platformService.getOverview() })
  } catch (err) {
    return next(err)
  }
}

export async function listClinicsHandler(req, res, next) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1)
    const status = ['active', 'suspended'].includes(req.query.status) ? req.query.status : 'all'
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : ''
    return sendSuccess(res, { data: await platformService.listClinics({ search, status, page }) })
  } catch (err) {
    return next(err)
  }
}

export async function getClinicHandler(req, res, next) {
  try {
    return sendSuccess(res, { data: await platformService.getClinic(req.params.id) })
  } catch (err) {
    return next(err)
  }
}

export async function suspendClinicHandler(req, res, next) {
  try {
    const clinic = await platformService.setClinicSuspended(
      req.platformAdmin,
      req.params.id,
      { suspended: true, reason: req.body.reason },
      req.ip,
    )
    return sendSuccess(res, { message: 'Clinic suspended', data: { clinic } })
  } catch (err) {
    return next(err)
  }
}

export async function unsuspendClinicHandler(req, res, next) {
  try {
    const clinic = await platformService.setClinicSuspended(req.platformAdmin, req.params.id, { suspended: false }, req.ip)
    return sendSuccess(res, { message: 'Clinic reactivated', data: { clinic } })
  } catch (err) {
    return next(err)
  }
}

export async function resetStaffPasswordHandler(req, res, next) {
  try {
    const result = await platformService.resetStaffPassword(
      req.platformAdmin,
      req.params.id,
      req.params.userId,
      req.ip,
    )
    // The temporary password is in this one response only - never cache it.
    res.setHeader('Cache-Control', 'no-store')
    return sendSuccess(res, { message: 'Password reset', data: result })
  } catch (err) {
    return next(err)
  }
}
