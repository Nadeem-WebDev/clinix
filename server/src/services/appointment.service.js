import mongoose from 'mongoose'
import { Appointment, APPOINTMENT_STATUSES } from '../models/Appointment.js'
import { Patient } from '../models/Patient.js'
import { User } from '../models/User.js'
import { Clinic } from '../models/Clinic.js'
import { nextSequenceAbove } from '../models/Counter.js'
import { ApiError } from '../utils/ApiError.js'
import { dateStrOf, dayRange } from '../utils/dateRange.js'
import { getClinicTimezone } from './clinic.service.js'
import * as whatsapp from './whatsapp.service.js'
import * as email from './email.service.js'

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
async function assertNoDoubleBooking(clinicId, tz, doctorId, scheduledAt, durationMinutes, excludeId) {
  const { start, end } = dayRange(dateStrOf(scheduledAt, tz), tz)
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

// One token sequence per clinic per day, shared by every doctor and by both
// bookings and walk-ins - so no two patients in the waiting room that day
// hold the same number. (It used to be per doctor, which gave each doctor's
// first patient token 1.) Each doctor's queue can therefore skip numbers.
//
// The floor is the highest token already issued that day, so the counter
// never repeats one - including on the day this replaced the per-doctor
// counters, whose tokens were issued under different counter names.
async function generateTokenNumber(clinicId, tz, scheduledAt) {
  const dateStr = dateStrOf(scheduledAt, tz)
  const { start, end } = dayRange(dateStr, tz)
  const highest = await Appointment.findOne({ clinicId, scheduledAt: { $gte: start, $lte: end } })
    .sort({ tokenNumber: -1 })
    .select('tokenNumber')
  return nextSequenceAbove(clinicId, `token-${dateStr}`, highest?.tokenNumber ?? 0)
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
  const { patientId, doctorId, scheduledAt, notes } = data
  await assertPatientAndDoctorInClinic(clinicId, patientId, doctorId)

  let { durationMinutes } = data
  if (!durationMinutes) {
    const clinic = await Clinic.findById(clinicId)
    durationMinutes = clinic?.defaultAppointmentDurationMinutes ?? 15
  }

  const tz = await getClinicTimezone(clinicId)
  await assertNoDoubleBooking(clinicId, tz, doctorId, scheduledAt, durationMinutes)
  const tokenNumber = await generateTokenNumber(clinicId, tz, scheduledAt)

  const appointment = await Appointment.create({
    clinicId,
    patientId,
    doctorId,
    scheduledAt,
    durationMinutes,
    tokenNumber,
    notes,
    createdBy: createdByUserId,
  })

  // Fire-and-forget on purpose: a booking is confirmed the moment it is
  // written, and must not wait on - or be failed by - Meta's API. See
  // whatsapp.service.js for the guarantees this relies on.
  whatsapp.notifyAppointmentBooked(appointment)
  email.notifyAppointmentBooked(appointment)

  return populateAppointment(appointment)
}

// A patient who turns up without a booking goes straight into today's queue:
// created already WAITING (they are at the desk), timed now, with the next
// token for that doctor. Unlike a booking it has no slot to claim, so there
// is no double-booking check - walk-ins queue behind whoever is already
// waiting - and no "appointment confirmed" WhatsApp, only the queue update a
// patient marked arrived would get.
export async function createWalkIn(clinicId, { patientId, doctorId, notes }, createdByUserId) {
  await assertPatientAndDoctorInClinic(clinicId, patientId, doctorId)

  const now = new Date()
  const tz = await getClinicTimezone(clinicId)
  const { start, end } = dayRange(dateStrOf(now, tz), tz)
  const existing = await Appointment.findOne({
    clinicId,
    patientId,
    doctorId,
    status: { $in: ['BOOKED', 'ARRIVED', 'WAITING', 'IN_CONSULTATION'] },
    scheduledAt: { $gte: start, $lte: end },
  })
  if (existing?.status === 'BOOKED') {
    // Already booked for today: marking that booking arrived is the right
    // move, not a second appointment. The id lets the UI offer exactly that.
    throw ApiError.conflict(
      'This patient already has a booking today with this doctor - mark it arrived instead',
      'BOOKED_TODAY',
      { appointmentId: String(existing._id) },
    )
  }
  if (existing) {
    throw ApiError.conflict('This patient is already in today\'s queue for this doctor', 'ALREADY_IN_QUEUE')
  }

  const clinic = await Clinic.findById(clinicId)
  const tokenNumber = await generateTokenNumber(clinicId, tz, now)

  const appointment = await Appointment.create({
    clinicId,
    patientId,
    doctorId,
    scheduledAt: now,
    durationMinutes: clinic?.defaultAppointmentDurationMinutes ?? 15,
    tokenNumber,
    notes,
    isWalkIn: true,
    status: 'WAITING',
    arrivedAt: now,
    createdBy: createdByUserId,
  })

  const populated = await populateAppointment(appointment)
  whatsapp.notifyQueueUpdate(populated)
  email.notifyQueueUpdate(populated)
  return populated
}

export async function listAppointments(clinicId, { date, from, to, doctorId, patientId, status, page, limit }) {
  const filter = { clinicId }

  // date/from/to are the clinic's calendar days.
  if (date || from || to) {
    const tz = await getClinicTimezone(clinicId)
    if (date) {
      const { start, end } = dayRange(date, tz)
      filter.scheduledAt = { $gte: start, $lte: end }
    } else {
      filter.scheduledAt = {}
      if (from) filter.scheduledAt.$gte = dayRange(from, tz).start
      if (to) filter.scheduledAt.$lte = dayRange(to, tz).end
    }
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
  const tz = await getClinicTimezone(clinicId)

  if (data.scheduledAt || data.durationMinutes) {
    await assertNoDoubleBooking(clinicId, tz, appointment.doctorId, scheduledAt, durationMinutes, appointment._id)
  }

  // A new day means a new per-day token sequence.
  if (data.scheduledAt && dateStrOf(data.scheduledAt, tz) !== dateStrOf(appointment.scheduledAt, tz)) {
    appointment.tokenNumber = await generateTokenNumber(clinicId, tz, scheduledAt)
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
  email.notifyQueueUpdate(updated)

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
  email.notifyQueueUpdate(updated)

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
  const tz = await getClinicTimezone(clinicId)
  const dateStr = date ?? dateStrOf(new Date(), tz)
  const { start, end } = dayRange(dateStr, tz)

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
