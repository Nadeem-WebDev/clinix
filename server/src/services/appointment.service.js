import mongoose from 'mongoose'
import { Appointment, APPOINTMENT_STATUSES } from '../models/Appointment.js'
import { Patient } from '../models/Patient.js'
import { User } from '../models/User.js'
import { Clinic } from '../models/Clinic.js'
import { nextSequence } from '../models/Counter.js'
import { ApiError } from '../utils/ApiError.js'
import { dateStrOf, dayRange } from '../utils/dateRange.js'
import * as whatsapp from './whatsapp.service.js'

const ACTIVE_STATUSES = APPOINTMENT_STATUSES.filter(
  (s) => s !== 'CANCELLED' && s !== 'NO_SHOW',
)

function assertValidId(id, label = 'id') {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw ApiError.badRequest(`Invalid ${label}`, 'INVALID_ID')
  }
}

async function assertPatientAndDoctorInClinic(clinicId, patientId, doctorId) {
  const [patient, doctor] = await Promise.all([
    Patient.findOne({ _id: patientId, clinicId }),
    User.findOne({ _id: doctorId, clinicId, active: true }),
  ])
  if (!patient) throw ApiError.badRequest('Patient not found in this clinic', 'PATIENT_NOT_FOUND')
  if (!doctor || doctor.role !== 'doctor') {
    throw ApiError.badRequest('Doctor not found in this clinic', 'DOCTOR_NOT_FOUND')
  }
  return { patient, doctor }
}

// Fetches this doctor's other active appointments on the same day and
// checks for any time-range overlap in JS - Mongo can't easily express
// "start < X AND start + duration > Y" as a single indexed query, and at
// clinic scale (a handful of doctors, dozens of appointments/day) this is
// cheap and simple rather than something worth a more complex query for.
async function assertNoDoubleBooking(clinicId, doctorId, scheduledAt, durationMinutes, excludeId) {
  const dateStr = dateStrOf(scheduledAt)
  const { start, end } = dayRange(dateStr)
  const newStart = new Date(scheduledAt).getTime()
  const newEnd = newStart + durationMinutes * 60 * 1000

  const sameDay = await Appointment.find({
    clinicId,
    doctorId,
    status: { $in: ACTIVE_STATUSES },
    scheduledAt: { $gte: start, $lte: end },
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  })

  const conflict = sameDay.some((appt) => {
    const existingStart = new Date(appt.scheduledAt).getTime()
    const existingEnd = existingStart + appt.durationMinutes * 60 * 1000
    return newStart < existingEnd && existingStart < newEnd
  })

  if (conflict) {
    throw ApiError.conflict(
      'This doctor already has an appointment that overlaps this time slot',
      'DOUBLE_BOOKED',
    )
  }
}

async function generateTokenNumber(clinicId, doctorId, scheduledAt) {
  const dateStr = dateStrOf(scheduledAt)
  return nextSequence(clinicId, `token-${doctorId}-${dateStr}`)
}

// Every mutation below returns a document populated the same way
// getAppointmentById/listAppointments do. The frontend mostly invalidates
// its query cache rather than writing these responses directly into it,
// but keeping the shape consistent avoids the same "blanked out
// patient/doctor name" bug this fixed on Consultation/Prescription if
// that ever changes.
async function populateAppointment(appointment) {
  return appointment.populate([
    { path: 'patientId', select: 'fullName patientId phone' },
    { path: 'doctorId', select: 'name' },
  ])
}

export async function createAppointment(clinicId, data, createdByUserId) {
  const { patientId, doctorId, scheduledAt, notes, isWalkIn } = data
  await assertPatientAndDoctorInClinic(clinicId, patientId, doctorId)

  let { durationMinutes } = data
  if (!durationMinutes) {
    const clinic = await Clinic.findById(clinicId)
    durationMinutes = clinic?.defaultAppointmentDurationMinutes ?? 15
  }

  await assertNoDoubleBooking(clinicId, doctorId, scheduledAt, durationMinutes)
  const tokenNumber = await generateTokenNumber(clinicId, doctorId, scheduledAt)

  const appointment = await Appointment.create({
    clinicId,
    patientId,
    doctorId,
    scheduledAt,
    durationMinutes,
    tokenNumber,
    notes,
    isWalkIn: Boolean(isWalkIn),
    createdBy: createdByUserId,
  })

  // Fire-and-forget on purpose: a booking is confirmed the moment it is
  // written, and must not wait on - or be failed by - Meta's API. See
  // whatsapp.service.js for the guarantees this relies on.
  whatsapp.notifyAppointmentBooked(appointment)

  return populateAppointment(appointment)
}

export async function listAppointments(clinicId, { date, from, to, doctorId, patientId, status, page, limit }) {
  const filter = { clinicId }

  if (date) {
    const { start, end } = dayRange(date)
    filter.scheduledAt = { $gte: start, $lte: end }
  } else if (from || to) {
    filter.scheduledAt = {}
    if (from) filter.scheduledAt.$gte = dayRange(from).start
    if (to) filter.scheduledAt.$lte = dayRange(to).end
  }
  if (doctorId) filter.doctorId = doctorId
  if (patientId) filter.patientId = patientId
  if (status) filter.status = status

  const skip = (page - 1) * limit
  const [appointments, total] = await Promise.all([
    Appointment.find(filter)
      .sort({ scheduledAt: 1 })
      .skip(skip)
      .limit(limit)
      .populate('patientId', 'fullName patientId phone')
      .populate('doctorId', 'name'),
    Appointment.countDocuments(filter),
  ])

  return {
    appointments,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  }
}

async function findOwned(clinicId, id) {
  assertValidId(id, 'appointment id')
  const appointment = await Appointment.findOne({ _id: id, clinicId })
  if (!appointment) throw ApiError.notFound('Appointment not found')
  return appointment
}

export async function getAppointmentById(clinicId, id) {
  assertValidId(id, 'appointment id')
  const appointment = await Appointment.findOne({ _id: id, clinicId })
    .populate('patientId', 'fullName patientId phone')
    .populate('doctorId', 'name')
  if (!appointment) throw ApiError.notFound('Appointment not found')
  return appointment
}

const RESCHEDULABLE_STATUSES = ['BOOKED', 'ARRIVED', 'WAITING']

export async function rescheduleAppointment(clinicId, id, data) {
  const appointment = await findOwned(clinicId, id)
  if (!RESCHEDULABLE_STATUSES.includes(appointment.status)) {
    throw ApiError.badRequest(
      `Cannot reschedule an appointment that is already ${appointment.status}`,
      'INVALID_TRANSITION',
    )
  }

  const scheduledAt = data.scheduledAt ?? appointment.scheduledAt
  const durationMinutes = data.durationMinutes ?? appointment.durationMinutes

  if (data.scheduledAt || data.durationMinutes) {
    await assertNoDoubleBooking(clinicId, appointment.doctorId, scheduledAt, durationMinutes, appointment._id)
  }

  // A new day means a new per-day token sequence.
  if (data.scheduledAt && dateStrOf(data.scheduledAt) !== dateStrOf(appointment.scheduledAt)) {
    appointment.tokenNumber = await generateTokenNumber(clinicId, appointment.doctorId, scheduledAt)
  }

  appointment.scheduledAt = scheduledAt
  appointment.durationMinutes = durationMinutes
  if (data.notes !== undefined) appointment.notes = data.notes
  await appointment.save()
  return populateAppointment(appointment)
}

async function transition(appointment, allowedFrom, next, extraFields = {}) {
  if (!allowedFrom.includes(appointment.status)) {
    throw ApiError.badRequest(
      `Cannot move an appointment from ${appointment.status} to ${next}`,
      'INVALID_TRANSITION',
    )
  }
  Object.assign(appointment, extraFields, { status: next })
  await appointment.save()
  return populateAppointment(appointment)
}

export async function markArrived(clinicId, id) {
  const appointment = await findOwned(clinicId, id)
  const updated = await transition(appointment, ['BOOKED'], 'WAITING', { arrivedAt: new Date() })

  // The patient just joined the waiting queue - one of the two queue
  // transitions worth messaging about (the other is being called in).
  // transition() throws on an invalid state change, so this only runs on a
  // real BOOKED -> WAITING move, never twice for the same appointment.
  whatsapp.notifyQueueUpdate(updated)

  return updated
}

export async function cancelAppointment(clinicId, id) {
  const appointment = await findOwned(clinicId, id)
  return transition(appointment, ['BOOKED', 'ARRIVED', 'WAITING'], 'CANCELLED', {
    cancelledAt: new Date(),
  })
}

export async function markNoShow(clinicId, id) {
  const appointment = await findOwned(clinicId, id)
  return transition(appointment, ['BOOKED', 'ARRIVED', 'WAITING'], 'NO_SHOW')
}

export async function callNextIntoConsultation(clinicId, id) {
  const appointment = await findOwned(clinicId, id)
  const updated = await transition(appointment, ['WAITING'], 'IN_CONSULTATION', {
    consultationStartedAt: new Date(),
  })

  // It is this patient's turn. Only they are messaged - the rest of the
  // waiting room is not notified each time the "now serving" token ticks,
  // which would be one message per waiting patient per call.
  whatsapp.notifyQueueUpdate(updated)

  return updated
}

export async function completeAppointment(clinicId, id) {
  const appointment = await findOwned(clinicId, id)
  return transition(appointment, ['IN_CONSULTATION'], 'COMPLETED', { completedAt: new Date() })
}

export async function skipAppointment(clinicId, id) {
  const appointment = await findOwned(clinicId, id)
  if (appointment.status !== 'WAITING') {
    throw ApiError.badRequest('Only a waiting appointment can be skipped', 'INVALID_TRANSITION')
  }
  appointment.skipped = true
  await appointment.save()
  return populateAppointment(appointment)
}

// The OPD queue for one doctor's day: everyone currently waiting or in
// consultation, ordered so the next patient to call is obvious - skipped
// patients sort after non-skipped ones, then by token order.
export async function getQueue(clinicId, { doctorId, date }) {
  const dateStr = date ?? dateStrOf(new Date())
  const { start, end } = dayRange(dateStr)

  const filter = {
    clinicId,
    scheduledAt: { $gte: start, $lte: end },
    status: { $in: ['WAITING', 'IN_CONSULTATION'] },
  }
  if (doctorId) filter.doctorId = doctorId

  const appointments = await Appointment.find(filter)
    .sort({ skipped: 1, tokenNumber: 1 })
    .populate('patientId', 'fullName patientId phone')
    .populate('doctorId', 'name')

  return { date: dateStr, appointments }
}
