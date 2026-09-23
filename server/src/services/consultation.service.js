import mongoose from 'mongoose'
import { Consultation } from '../models/Consultation.js'
import { Patient } from '../models/Patient.js'
import { User } from '../models/User.js'
import { Appointment } from '../models/Appointment.js'
import { ApiError } from '../utils/ApiError.js'
import { todayDateStr, dayRange, addDaysToDateStr } from '../utils/dateRange.js'

function assertValidId(id, label = 'id') {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw ApiError.badRequest(`Invalid ${label}`, 'INVALID_ID')
  }
}

async function assertReferences(clinicId, { patientId, doctorId, appointmentId }) {
  const [patient, doctor] = await Promise.all([
    Patient.findOne({ _id: patientId, clinicId }),
    User.findOne({ _id: doctorId, clinicId, active: true }),
  ])
  if (!patient) throw ApiError.badRequest('Patient not found in this clinic', 'PATIENT_NOT_FOUND')
  if (!doctor || doctor.role !== 'doctor') {
    throw ApiError.badRequest('Doctor not found in this clinic', 'DOCTOR_NOT_FOUND')
  }

  if (appointmentId) {
    const appointment = await Appointment.findOne({ _id: appointmentId, clinicId })
    if (!appointment) {
      throw ApiError.badRequest('Appointment not found in this clinic', 'APPOINTMENT_NOT_FOUND')
    }
    if (String(appointment.patientId) !== String(patientId) || String(appointment.doctorId) !== String(doctorId)) {
      throw ApiError.badRequest(
        'This appointment does not belong to the given patient/doctor',
        'APPOINTMENT_MISMATCH',
      )
    }
    return appointment
  }
  return null
}

// Every mutation below returns a document populated the same way
// getConsultationById does - the frontend replaces its query cache
// directly with these responses, so a differently-shaped (unpopulated)
// result would silently blank out the patient/doctor name after any edit.
async function populateConsultation(consultation) {
  return consultation.populate([
    { path: 'patientId', select: 'fullName patientId' },
    { path: 'doctorId', select: 'name' },
  ])
}

export async function createConsultation(clinicId, data, createdByUserId) {
  await assertReferences(clinicId, data)
  const consultation = await Consultation.create({ ...data, clinicId, createdBy: createdByUserId })
  return populateConsultation(consultation)
}

export async function listConsultations(clinicId, { patientId, doctorId, appointmentId, page, limit }) {
  const filter = { clinicId }
  if (patientId) filter.patientId = patientId
  if (doctorId) filter.doctorId = doctorId
  if (appointmentId) filter.appointmentId = appointmentId

  const skip = (page - 1) * limit
  const [consultations, total] = await Promise.all([
    Consultation.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('patientId', 'fullName patientId')
      .populate('doctorId', 'name'),
    Consultation.countDocuments(filter),
  ])

  return {
    consultations,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  }
}

async function findOwned(clinicId, id) {
  assertValidId(id, 'consultation id')
  const consultation = await Consultation.findOne({ _id: id, clinicId })
  if (!consultation) throw ApiError.notFound('Consultation not found')
  return consultation
}

export async function getConsultationById(clinicId, id) {
  assertValidId(id, 'consultation id')
  const consultation = await Consultation.findOne({ _id: id, clinicId })
    .populate('patientId', 'fullName patientId')
    .populate('doctorId', 'name')
  if (!consultation) throw ApiError.notFound('Consultation not found')
  return consultation
}

// "Do not overwrite old consultations" / "preserve historical records" -
// once the linked appointment is COMPLETED, the visit is over and the
// record is locked. A consultation with no linked appointment (edge case)
// stays editable, since there's no completion signal to hook into.
export async function updateConsultation(clinicId, id, data) {
  const consultation = await findOwned(clinicId, id)

  if (consultation.appointmentId) {
    const appointment = await Appointment.findOne({ _id: consultation.appointmentId, clinicId })
    if (appointment?.status === 'COMPLETED') {
      throw ApiError.badRequest(
        'This consultation is finalized and can no longer be edited',
        'CONSULTATION_FINALIZED',
      )
    }
  }

  Object.assign(consultation, data)
  await consultation.save()
  return populateConsultation(consultation)
}

// Consultations with a follow-up due in the next `days` days (today
// included) - drives both the dashboard's "Follow-ups due" widget and the
// dedicated GET /consultations/follow-ups endpoint. A doctor viewing their
// own dashboard passes their own id to scope this to just their patients;
// omitted, it's clinic-wide (owner/admin).
export async function listFollowUpsDue(clinicId, { doctorId } = {}, days = 7) {
  const today = todayDateStr()
  const { start } = dayRange(today)
  const { end } = dayRange(addDaysToDateStr(today, days))
  const filter = {
    clinicId,
    followUpDate: { $gte: start, $lte: end },
    ...(doctorId ? { doctorId } : {}),
  }
  return Consultation.find(filter)
    .sort({ followUpDate: 1 })
    .limit(10)
    .populate('patientId', 'fullName patientId phone')
}
