import mongoose from 'mongoose'
import { Patient } from '../models/Patient.js'
import { nextSequence } from '../models/Counter.js'
import { ApiError } from '../utils/ApiError.js'

function assertValidId(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw ApiError.badRequest('Invalid patient id', 'INVALID_ID')
  }
}

// Every function takes clinicId explicitly from the controller (which gets
// it only from req.clinicId, set by the authenticate middleware) - never
// from the request body/params/query. This is the tenant-isolation
// boundary for the whole patients module.

async function generatePatientId(clinicId) {
  const seq = await nextSequence(clinicId, 'patientId')
  return `P-${10000 + seq}`
}

export async function createPatient(clinicId, data, createdByUserId) {
  const patientId = await generatePatientId(clinicId)
  return Patient.create({ ...data, clinicId, patientId, createdBy: createdByUserId })
}

export async function listPatients(clinicId, { search, page, limit }) {
  const filter = { clinicId }

  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(escaped, 'i')
    filter.$or = [{ patientId: regex }, { fullName: regex }, { phone: regex }]
  }

  const skip = (page - 1) * limit
  const [patients, total] = await Promise.all([
    Patient.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Patient.countDocuments(filter),
  ])

  return {
    patients,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  }
}

export async function getPatientById(clinicId, id) {
  assertValidId(id)
  const patient = await Patient.findOne({ _id: id, clinicId })
  if (!patient) {
    throw ApiError.notFound('Patient not found')
  }
  return patient
}

export async function updatePatient(clinicId, id, data) {
  assertValidId(id)
  const patient = await Patient.findOneAndUpdate({ _id: id, clinicId }, data, {
    new: true,
    runValidators: true,
  })
  if (!patient) {
    throw ApiError.notFound('Patient not found')
  }
  return patient
}
