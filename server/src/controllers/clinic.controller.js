import * as clinicService from '../services/clinic.service.js'
import { sendSuccess } from '../utils/ApiResponse.js'
import { writeAuditLog } from '../utils/audit.js'

export async function getClinicSettingsHandler(req, res, next) {
  try {
    const clinic = await clinicService.getClinicSettings(req.clinicId)
    return sendSuccess(res, { data: { clinic } })
  } catch (err) {
    return next(err)
  }
}

export async function updateClinicSettingsHandler(req, res, next) {
  try {
    const clinic = await clinicService.updateClinicSettings(req.clinicId, req.body)

    await writeAuditLog({
      clinicId: req.clinicId,
      userId: req.user._id,
      action: 'CLINIC_SETTINGS_UPDATED',
      resourceType: 'Clinic',
      resourceId: clinic._id,
      ipAddress: req.ip,
    })

    return sendSuccess(res, { message: 'Clinic settings updated', data: { clinic } })
  } catch (err) {
    return next(err)
  }
}
