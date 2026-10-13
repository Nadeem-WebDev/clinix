import { Appointment } from '../models/Appointment.js'
import { Consultation } from '../models/Consultation.js'
import { Prescription } from '../models/Prescription.js'
import { Invoice } from '../models/Invoice.js'
import { getPatientById } from './patient.service.js'
import { dateStrOf, todayDateStr, calendarDateOf } from '../utils/dateRange.js'
import { getClinicTimezone } from './clinic.service.js'

// Patient profile "Visits" and "Follow-ups" tabs. Both are views over records
// that already exist (appointment -> consultation -> prescription -> invoice),
// assembled here rather than in the browser so each role gets one call that
// already leaves out what it may not see:
//   clinical (owner/admin/doctor): diagnosis, prescriptions, follow-up instructions
//   billing  (owner/admin/receptionist): invoices
// - the same lines the Consultations / Prescriptions / Billing tabs draw.

const HISTORY_LIMIT = 50

// Appointments that represent the patient actually being at the clinic. A
// future BOOKED slot is an appointment, not a visit; CANCELLED / NO_SHOW never
// happened. All of those stay on the Appointments tab.
const VISIT_STATUSES = ['ARRIVED', 'WAITING', 'IN_CONSULTATION', 'COMPLETED']

// What counts as the patient having been seen again after a follow-up was set.
const SEEN_STATUSES = ['IN_CONSULTATION', 'COMPLETED']

const idOf = (value) => (value ? String(value._id ?? value) : null)
const doctorOf = (doc) => (doc.doctorId ? { name: doc.doctorId.name } : null)

export async function listPatientVisits(clinicId, patientId, { clinical, billing }) {
  await getPatientById(clinicId, patientId)
  const tz = await getClinicTimezone(clinicId)

  const [appointments, consultations, invoices] = await Promise.all([
    Appointment.find({ clinicId, patientId, status: { $in: VISIT_STATUSES } })
      .sort({ scheduledAt: -1 })
      .limit(HISTORY_LIMIT)
      .populate('doctorId', 'name'),
    Consultation.find({ clinicId, patientId })
      .sort({ createdAt: -1 })
      .limit(HISTORY_LIMIT)
      .select('appointmentId doctorId diagnosis createdAt')
      .populate('doctorId', 'name'),
    billing
      ? Invoice.find({ clinicId, patientId })
          .sort({ createdAt: -1 })
          .limit(HISTORY_LIMIT)
          .select('appointmentId consultationId invoiceNumber total paymentStatus createdAt')
      : [],
  ])
  const prescriptions =
    clinical && consultations.length
      ? await Prescription.find({ clinicId, consultationId: { $in: consultations.map((c) => c._id) } }).select(
          'consultationId finalized medicines',
        )
      : []

  const visits = []
  const byAppointment = new Map()
  const byConsultation = new Map()

  for (const appt of appointments) {
    const visit = {
      key: `appointment-${appt._id}`,
      date: appt.scheduledAt,
      doctor: doctorOf(appt),
      status: appt.status,
      isWalkIn: appt.isWalkIn,
      tokenNumber: appt.tokenNumber,
      consultation: null,
      prescriptions: [],
      invoices: [],
    }
    visits.push(visit)
    byAppointment.set(String(appt._id), visit)
  }

  for (const c of consultations) {
    // A consultation recorded without an appointment (created directly by a
    // doctor) is a visit of its own.
    let visit = byAppointment.get(idOf(c.appointmentId))
    if (!visit) {
      visit = {
        key: `consultation-${c._id}`,
        date: c.createdAt,
        doctor: doctorOf(c),
        status: null,
        isWalkIn: false,
        tokenNumber: null,
        consultation: null,
        prescriptions: [],
        invoices: [],
      }
      visits.push(visit)
    }
    visit.consultation = clinical ? { id: String(c._id), diagnosis: c.diagnosis || null } : { recorded: true }
    byConsultation.set(String(c._id), visit)
  }

  for (const p of prescriptions) {
    byConsultation.get(idOf(p.consultationId))?.prescriptions.push({
      id: String(p._id),
      finalized: p.finalized,
      medicineCount: p.medicines.length,
    })
  }

  // Bills created from a consultation carry its ids; bills raised from the
  // Billing page usually don't (there is no UI to link them), so those are
  // matched to a visit on the same day. Anything still unmatched is shown as
  // its own entry rather than silently dropped.
  for (const inv of invoices) {
    const summary = {
      id: String(inv._id),
      invoiceNumber: inv.invoiceNumber,
      total: inv.total,
      paymentStatus: inv.paymentStatus,
    }
    const visit =
      byAppointment.get(idOf(inv.appointmentId)) ??
      byConsultation.get(idOf(inv.consultationId)) ??
      visits.find((v) => !v.billOnly && dateStrOf(v.date, tz) === dateStrOf(inv.createdAt, tz))
    if (visit) {
      visit.invoices.push(summary)
    } else {
      visits.push({
        key: `invoice-${inv._id}`,
        date: inv.createdAt,
        doctor: null,
        status: null,
        isWalkIn: false,
        tokenNumber: null,
        consultation: null,
        prescriptions: [],
        invoices: [summary],
        billOnly: true,
      })
    }
  }

  return visits.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, HISTORY_LIMIT)
}

const FOLLOW_UP_ORDER = { due_today: 0, overdue: 1, upcoming: 2, done: 3 }

// When a consultation's visit happened: its appointment's time, or - for a
// consultation recorded without one - when it was written. Not createdAt
// alone: notes written up after the fact (or imported) would otherwise
// look like a later visit than the one they belong to.
const visitTimeOf = (c) => new Date(c.appointmentId?.scheduledAt ?? c.createdAt).getTime()

export async function listPatientFollowUps(clinicId, patientId, { clinical }) {
  await getPatientById(clinicId, patientId)
  const tz = await getClinicTimezone(clinicId)

  const [withFollowUp, allConsultations, seenAppointments] = await Promise.all([
    Consultation.find({ clinicId, patientId, followUpDate: { $ne: null } })
      .sort({ followUpDate: -1 })
      .limit(HISTORY_LIMIT)
      .select('doctorId appointmentId followUpDate followUpInstructions createdAt')
      .populate('doctorId', 'name')
      .populate('appointmentId', 'scheduledAt'),
    Consultation.find({ clinicId, patientId }).select('appointmentId createdAt').populate('appointmentId', 'scheduledAt'),
    Appointment.find({ clinicId, patientId, status: { $in: SEEN_STATUSES } }).select('scheduledAt'),
  ])

  const seenTimes = [
    ...allConsultations.map(visitTimeOf),
    ...seenAppointments.map((a) => new Date(a.scheduledAt).getTime()),
  ]
  const today = todayDateStr(tz)

  return withFollowUp
    .map((c) => {
      const setAt = visitTimeOf(c)
      // Seen again at a later visit = done, whatever the date.
      const seenSince = seenTimes.some((t) => t > setAt)
      const day = calendarDateOf(c.followUpDate, tz)
      let status = 'upcoming'
      if (seenSince) status = 'done'
      else if (day < today) status = 'overdue'
      else if (day === today) status = 'due_today'

      return {
        key: String(c._id),
        followUpDate: c.followUpDate,
        setOn: new Date(setAt),
        doctor: doctorOf(c),
        status,
        // The instructions are part of the doctor's notes; the front desk
        // gets the date so it can book the visit, not the clinical content.
        ...(clinical ? { consultationId: String(c._id), instructions: c.followUpInstructions || null } : {}),
      }
    })
    .sort((a, b) => {
      const byStatus = FOLLOW_UP_ORDER[a.status] - FOLLOW_UP_ORDER[b.status]
      if (byStatus) return byStatus
      // Upcoming soonest first; everything else most recent first.
      const diff = new Date(a.followUpDate) - new Date(b.followUpDate)
      return a.status === 'upcoming' ? diff : -diff
    })
}
