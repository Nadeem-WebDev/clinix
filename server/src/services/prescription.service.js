import mongoose from 'mongoose'
import { Prescription } from '../models/Prescription.js'
import { Patient } from '../models/Patient.js'
import { User } from '../models/User.js'
import { Consultation } from '../models/Consultation.js'
import { ApiError } from '../utils/ApiError.js'
import * as whatsapp from './whatsapp.service.js'

function assertValidId(id, label = 'id') {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw ApiError.badRequest(`Invalid ${label}`, 'INVALID_ID')
  }
}

async function assertReferences(clinicId, { patientId, doctorId, consultationId }) {
  const [patient, doctor, consultation] = await Promise.all([
    Patient.findOne({ _id: patientId, clinicId }),
    User.findOne({ _id: doctorId, clinicId, active: true }),
    Consultation.findOne({ _id: consultationId, clinicId }),
  ])
  if (!patient) throw ApiError.badRequest('Patient not found in this clinic', 'PATIENT_NOT_FOUND')
  if (!doctor || doctor.role !== 'doctor') {
    throw ApiError.badRequest('Doctor not found in this clinic', 'DOCTOR_NOT_FOUND')
  }
  if (!consultation) {
    throw ApiError.badRequest('Consultation not found in this clinic', 'CONSULTATION_NOT_FOUND')
  }
  if (String(consultation.patientId) !== String(patientId) || String(consultation.doctorId) !== String(doctorId)) {
    throw ApiError.badRequest(
      'This consultation does not belong to the given patient/doctor',
      'CONSULTATION_MISMATCH',
    )
  }
}

// Every mutation below returns a document populated the same way
// getPrescriptionById does - the frontend replaces its query cache
// directly with these responses, so a differently-shaped (unpopulated)
// result would silently blank out the patient/doctor name after any edit.
async function populatePrescription(prescription) {
  return prescription.populate([
    { path: 'patientId', select: 'fullName patientId dob age gender' },
    { path: 'doctorId', select: 'name' },
    { path: 'consultationId', select: 'diagnosis followUpDate' },
  ])
}

export async function createPrescription(clinicId, data, createdByUserId) {
  await assertReferences(clinicId, data)
  const prescription = await Prescription.create({ ...data, clinicId, createdBy: createdByUserId })
  return populatePrescription(prescription)
}

export async function listPrescriptions(clinicId, { patientId, doctorId, consultationId, page, limit }) {
  const filter = { clinicId }
  if (patientId) filter.patientId = patientId
  if (doctorId) filter.doctorId = doctorId
  if (consultationId) filter.consultationId = consultationId

  const skip = (page - 1) * limit
  const [prescriptions, total] = await Promise.all([
    Prescription.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('patientId', 'fullName patientId')
      .populate('doctorId', 'name'),
    Prescription.countDocuments(filter),
  ])

  return {
    prescriptions,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  }
}

async function findOwned(clinicId, id) {
  assertValidId(id, 'prescription id')
  const prescription = await Prescription.findOne({ _id: id, clinicId })
  if (!prescription) throw ApiError.notFound('Prescription not found')
  return prescription
}

export async function getPrescriptionById(clinicId, id) {
  assertValidId(id, 'prescription id')
  const prescription = await Prescription.findOne({ _id: id, clinicId })
    .populate('patientId', 'fullName patientId dob age gender')
    .populate('doctorId', 'name')
    .populate('consultationId', 'diagnosis followUpDate')
  if (!prescription) throw ApiError.notFound('Prescription not found')
  return prescription
}

export async function updatePrescription(clinicId, id, data) {
  const prescription = await findOwned(clinicId, id)
  if (prescription.finalized) {
    throw ApiError.badRequest(
      'This prescription is finalized and can no longer be edited',
      'PRESCRIPTION_FINALIZED',
    )
  }
  Object.assign(prescription, data)
  await prescription.save()
  return populatePrescription(prescription)
}

export async function finalizePrescription(clinicId, id) {
  const prescription = await findOwned(clinicId, id)
  if (prescription.finalized) {
    throw ApiError.badRequest('This prescription is already finalized', 'PRESCRIPTION_FINALIZED')
  }
  if (prescription.medicines.length === 0) {
    throw ApiError.badRequest('Add at least one medicine before finalizing', 'NO_MEDICINES')
  }
  prescription.finalized = true
  prescription.finalizedAt = new Date()
  await prescription.save()

  // Fire-and-forget: finalizing must succeed even if Meta is unreachable.
  // No PDF link goes out - see DOCUMENT_PICKUP_FALLBACK in
  // whatsapp.service.js for why the message says "collect it from the
  // front desk" instead.
  whatsapp.notifyDocumentReady({
    clinicId: prescription.clinicId,
    patientId: prescription.patientId,
    documentType: 'prescription',
    resourceType: 'Prescription',
    resourceId: prescription._id,
  })

  return populatePrescription(prescription)
}
