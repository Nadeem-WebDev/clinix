import { Appointment } from '../models/Appointment.js'
import { Clinic } from '../models/Clinic.js'
import { dateStrOf, dayRange } from '../utils/dateRange.js'

// Everything in this file is reachable WITHOUT authentication (see
// routes/public.routes.js). Deliberately kept in its own service so that
// "what can an anonymous visitor read?" is answerable by reading one file,
// rather than by auditing which fields getQueue() happens to populate.
//
// The rule for anything added here: build plain objects field by field.
// Never return a Mongoose document, never spread one, never `select(-x)` a
// sensitive field away - that's a denylist, and the next field someone adds
// to Patient would leak by default.

// How many upcoming tokens to show. Enough for a waiting patient to judge
// "am I next or is it a while yet", short enough that a waiting-room TV
// doesn't become a roster of everyone in the building.
const UPCOMING_LIMIT = 5

// "Priya Sharma" -> "Priya S." - enough for someone to recognise their own
// token on a public screen, not enough to identify a stranger. Patient has
// a single `fullName` field (no first/last split), so the initial comes
// from the last whitespace-separated word.
export function maskPatientName(fullName) {
  const parts = String(fullName ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'Patient'
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`
}

// Mirrors getQueue()'s day window and status filter, but returns a strict
// allow-list projection instead of populated documents.
//
// `date` bucketing is UTC, exactly like getQueue/dashboard/reports - see
// the README's known limitation. Not made worse here, not fixed here
// either; fixing it is a clinic-timezone change across all of them.
export async function getPublicQueue(clinicId, { date } = {}) {
  const dateStr = date ?? dateStrOf(new Date())
  const { start, end } = dayRange(dateStr)

  const [clinic, appointments] = await Promise.all([
    Clinic.findById(clinicId),
    Appointment.find({
      clinicId,
      scheduledAt: { $gte: start, $lte: end },
      status: { $in: ['WAITING', 'IN_CONSULTATION'] },
    })
      .sort({ skipped: 1, tokenNumber: 1 })
      .populate('patientId', 'fullName')
      .populate('doctorId', 'name'),
  ])

  const inConsultation = appointments.filter((a) => a.status === 'IN_CONSULTATION')
  const waiting = appointments.filter((a) => a.status === 'WAITING')

  // Keyed by doctor name rather than id: a public consumer has no way to
  // resolve an ObjectId to a person, and exposing internal ids on an
  // unauthenticated endpoint invites them being used as a handle elsewhere.
  const nowServing = inConsultation.map((appt) => ({
    doctorName: appt.doctorId?.name ?? 'Doctor',
    tokenNumber: appt.tokenNumber,
  }))

  const upcoming = waiting.slice(0, UPCOMING_LIMIT).map((appt) => ({
    tokenNumber: appt.tokenNumber,
    patientName: maskPatientName(appt.patientId?.fullName),
  }))

  // Deliberately naive: queue length x the clinic's default slot length.
  // It ignores per-appointment duration, how far into the current
  // consultation we are, and multiple doctors working in parallel (so it
  // over-estimates for a multi-doctor clinic). `isEstimate` is in the
  // response so the UI is obliged to label it as a guess.
  const slotMinutes = clinic?.defaultAppointmentDurationMinutes ?? 15
  const estimatedWaitMinutes = waiting.length * slotMinutes

  return {
    clinicName: clinic?.name ?? '',
    date: dateStr,
    nowServing,
    waitingCount: waiting.length,
    upcoming,
    estimatedWaitMinutes,
    isEstimate: true,
  }
}
