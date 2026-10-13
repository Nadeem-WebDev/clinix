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

export async function uploadClinicLogoHandler(req, res, next) {
  try {
    const clinic = await clinicService.setClinicLogo(req.clinicId, req.file)

    await writeAuditLog({
      clinicId: req.clinicId,
      userId: req.user._id,
      action: 'CLINIC_LOGO_UPDATED',
      resourceType: 'Clinic',
      resourceId: clinic._id,
      ipAddress: req.ip,
    })

    return sendSuccess(res, { message: 'Clinic logo updated', data: { clinic } })
  } catch (err) {
    return next(err)
  }
}

export async function removeClinicLogoHandler(req, res, next) {
  try {
    const clinic = await clinicService.removeClinicLogo(req.clinicId)

    await writeAuditLog({
      clinicId: req.clinicId,
      userId: req.user._id,
      action: 'CLINIC_LOGO_REMOVED',
      resourceType: 'Clinic',
      resourceId: clinic._id,
      ipAddress: req.ip,
    })

    return sendSuccess(res, { message: 'Clinic logo removed', data: { clinic } })
  } catch (err) {
    return next(err)
  }
}
