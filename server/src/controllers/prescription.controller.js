import * as prescriptionService from '../services/prescription.service.js'
import { streamPrescriptionPdf } from '../services/pdf/prescriptionPdf.js'
import { Clinic } from '../models/Clinic.js'
import { sendSuccess } from '../utils/ApiResponse.js'
import { writeAuditLog } from '../utils/audit.js'
import { ApiError } from '../utils/ApiError.js'

// Audit metadata is deliberately just the resource id - never medicine
// names/dosages/instructions.
function audit(req, prescription, action) {
  return writeAuditLog({
    clinicId: req.clinicId,
    userId: req.user._id,
    action,
    resourceType: 'Prescription',
    resourceId: prescription._id,
    ipAddress: req.ip,
  })
}

export async function createPrescriptionHandler(req, res, next) {
  try {
    const prescription = await prescriptionService.createPrescription(req.clinicId, req.body, req.user._id)
    await audit(req, prescription, 'PRESCRIPTION_CREATED')
    return sendSuccess(res, {
      status: 201,
      message: 'Prescription saved',
      data: { prescription },
    })
  } catch (err) {
    return next(err)
  }
}

export async function listPrescriptionsHandler(req, res, next) {
  try {
    const result = await prescriptionService.listPrescriptions(req.clinicId, req.validatedQuery)
    return sendSuccess(res, { data: result })
  } catch (err) {
    return next(err)
  }
}

export async function getPrescriptionHandler(req, res, next) {
  try {
    const prescription = await prescriptionService.getPrescriptionById(req.clinicId, req.params.id)
    return sendSuccess(res, { data: { prescription } })
  } catch (err) {
    return next(err)
  }
}

export async function updatePrescriptionHandler(req, res, next) {
  try {
    const prescription = await prescriptionService.updatePrescription(req.clinicId, req.params.id, req.body)
    await audit(req, prescription, 'PRESCRIPTION_UPDATED')
    return sendSuccess(res, { message: 'Prescription updated', data: { prescription } })
  } catch (err) {
    return next(err)
  }
}

export async function finalizePrescriptionHandler(req, res, next) {
  try {
    const prescription = await prescriptionService.finalizePrescription(req.clinicId, req.params.id)
    await audit(req, prescription, 'PRESCRIPTION_FINALIZED')
    return sendSuccess(res, { message: 'Prescription finalized', data: { prescription } })
  } catch (err) {
    return next(err)
  }
}

export async function getPrescriptionPdfHandler(req, res, next) {
  try {
    const prescription = await prescriptionService.getPrescriptionById(req.clinicId, req.params.id)
    const clinic = await Clinic.findById(req.clinicId)
    if (!clinic) throw ApiError.notFound('Clinic not found')

    await audit(req, prescription, 'PRESCRIPTION_PDF_VIEWED')

    streamPrescriptionPdf(res, {
      clinic,
      doctor: prescription.doctorId,
      patient: prescription.patientId,
      consultation: prescription.consultationId,
      prescription,
    })
  } catch (err) {
    next(err)
  }
}
