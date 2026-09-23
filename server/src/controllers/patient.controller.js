import * as patientService from '../services/patient.service.js'
import { sendSuccess } from '../utils/ApiResponse.js'
import { writeAuditLog } from '../utils/audit.js'

export async function createPatientHandler(req, res, next) {
  try {
    const patient = await patientService.createPatient(req.clinicId, req.body, req.user._id)

    await writeAuditLog({
      clinicId: req.clinicId,
      userId: req.user._id,
      action: 'PATIENT_CREATED',
      resourceType: 'Patient',
      resourceId: patient._id,
      ipAddress: req.ip,
    })

    return sendSuccess(res, {
      status: 201,
      message: 'Patient registered successfully',
      data: { patient },
    })
  } catch (err) {
    return next(err)
  }
}

export async function listPatientsHandler(req, res, next) {
  try {
    const result = await patientService.listPatients(req.clinicId, req.validatedQuery)
    return sendSuccess(res, { data: result })
  } catch (err) {
    return next(err)
  }
}

export async function getPatientHandler(req, res, next) {
  try {
    const patient = await patientService.getPatientById(req.clinicId, req.params.id)
    return sendSuccess(res, { data: { patient } })
  } catch (err) {
    return next(err)
  }
}

export async function updatePatientHandler(req, res, next) {
  try {
    const patient = await patientService.updatePatient(req.clinicId, req.params.id, req.body)

    await writeAuditLog({
      clinicId: req.clinicId,
      userId: req.user._id,
      action: 'PATIENT_UPDATED',
      resourceType: 'Patient',
      resourceId: patient._id,
      ipAddress: req.ip,
    })

    return sendSuccess(res, { message: 'Patient updated', data: { patient } })
  } catch (err) {
    return next(err)
  }
}
