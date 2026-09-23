import * as consultationService from '../services/consultation.service.js'
import { sendSuccess } from '../utils/ApiResponse.js'
import { writeAuditLog } from '../utils/audit.js'

// Audit metadata deliberately excludes clinical content (diagnosis, notes,
// vitals, etc.) - only ever the resource id, per "avoid logging sensitive
// medical information unnecessarily".
function audit(req, consultation, action) {
  return writeAuditLog({
    clinicId: req.clinicId,
    userId: req.user._id,
    action,
    resourceType: 'Consultation',
    resourceId: consultation._id,
    ipAddress: req.ip,
  })
}

export async function createConsultationHandler(req, res, next) {
  try {
    const consultation = await consultationService.createConsultation(req.clinicId, req.body, req.user._id)
    await audit(req, consultation, 'CONSULTATION_CREATED')
    return sendSuccess(res, {
      status: 201,
      message: 'Consultation saved',
      data: { consultation },
    })
  } catch (err) {
    return next(err)
  }
}

// A doctor only ever sees their own patients' follow-ups; owner/admin see
// every doctor's (matches the same role-scoping the dashboard's admin/
// doctor variants already use).
export async function listFollowUpsDueHandler(req, res, next) {
  try {
    const doctorId = req.user.role === 'doctor' ? req.user._id : undefined
    const followUps = await consultationService.listFollowUpsDue(req.clinicId, { doctorId })
    return sendSuccess(res, { data: { followUps } })
  } catch (err) {
    return next(err)
  }
}

export async function listConsultationsHandler(req, res, next) {
  try {
    const result = await consultationService.listConsultations(req.clinicId, req.validatedQuery)
    return sendSuccess(res, { data: result })
  } catch (err) {
    return next(err)
  }
}

export async function getConsultationHandler(req, res, next) {
  try {
    const consultation = await consultationService.getConsultationById(req.clinicId, req.params.id)
    return sendSuccess(res, { data: { consultation } })
  } catch (err) {
    return next(err)
  }
}

export async function updateConsultationHandler(req, res, next) {
  try {
    const consultation = await consultationService.updateConsultation(req.clinicId, req.params.id, req.body)
    await audit(req, consultation, 'CONSULTATION_UPDATED')
    return sendSuccess(res, { message: 'Consultation updated', data: { consultation } })
  } catch (err) {
    return next(err)
  }
}
