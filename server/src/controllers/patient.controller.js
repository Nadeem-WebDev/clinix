import * as patientService from '../services/patient.service.js'
import { listPatientVisits, listPatientFollowUps } from '../services/patientHistory.service.js'
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

// Same role lines as the patient profile's Consultations/Prescriptions tabs
// (clinical) and Billing tab (billing).
const CLINICAL_ROLES = ['owner', 'admin', 'doctor']
const BILLING_ROLES = ['owner', 'admin', 'receptionist']

export async function listPatientVisitsHandler(req, res, next) {
  try {
    const visits = await listPatientVisits(req.clinicId, req.params.id, {
      clinical: CLINICAL_ROLES.includes(req.user.role),
      billing: BILLING_ROLES.includes(req.user.role),
    })
    return sendSuccess(res, { data: { visits } })
  } catch (err) {
    return next(err)
  }
}

export async function listPatientFollowUpsHandler(req, res, next) {
  try {
    const followUps = await listPatientFollowUps(req.clinicId, req.params.id, {
      clinical: CLINICAL_ROLES.includes(req.user.role),
    })
    return sendSuccess(res, { data: { followUps } })
  } catch (err) {
    return next(err)
  }
}
