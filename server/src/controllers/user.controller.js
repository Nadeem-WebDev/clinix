import * as userService from '../services/user.service.js'
import { sendSuccess } from '../utils/ApiResponse.js'
import { writeAuditLog } from '../utils/audit.js'

export async function createStaffHandler(req, res, next) {
  try {
    const staff = await userService.createStaff(req.clinicId, req.body, req.user.role)

    await writeAuditLog({
      clinicId: req.clinicId,
      userId: req.user._id,
      action: 'USER_CREATED',
      resourceType: 'User',
      resourceId: staff._id,
      metadata: { role: staff.role },
      ipAddress: req.ip,
    })

    return sendSuccess(res, {
      status: 201,
      message: 'Staff member created',
      data: { user: staff },
    })
  } catch (err) {
    return next(err)
  }
}

export async function listStaffHandler(req, res, next) {
  try {
    const staff = await userService.listStaff(req.clinicId)
    return sendSuccess(res, { data: { staff } })
  } catch (err) {
    return next(err)
  }
}

export async function setStaffActiveHandler(req, res, next) {
  try {
    const active = req.body.active !== false
    const staff = await userService.setStaffActive(req.clinicId, req.params.id, active)

    await writeAuditLog({
      clinicId: req.clinicId,
      userId: req.user._id,
      action: active ? 'USER_ENABLED' : 'USER_DISABLED',
      resourceType: 'User',
      resourceId: staff._id,
      ipAddress: req.ip,
    })

    return sendSuccess(res, {
      message: active ? 'Staff member enabled' : 'Staff member disabled',
      data: { user: staff },
    })
  } catch (err) {
    return next(err)
  }
}
