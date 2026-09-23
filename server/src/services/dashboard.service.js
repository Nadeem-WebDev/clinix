import mongoose from 'mongoose'
import { Appointment } from '../models/Appointment.js'
import { Patient } from '../models/Patient.js'
import { Consultation } from '../models/Consultation.js'
import { Invoice } from '../models/Invoice.js'
import { Payment } from '../models/Payment.js'
import { todayDateStr, dayRange, addDaysToDateStr } from '../utils/dateRange.js'

function round2(n) {
  return Math.round(n * 100) / 100
}

async function getAdminDashboard(clinicId) {
  const today = todayDateStr()
  const { start, end } = dayRange(today)
  const weekEnd = dayRange(addDaysToDateStr(today, 7)).end
  // Aggregation pipelines don't auto-cast like .find()/.countDocuments()
  // do - clinicId must be cast to ObjectId explicitly or $match silently
  // matches nothing (comparing a BSON ObjectId field to a raw string).
  const clinicObjectId = new mongoose.Types.ObjectId(clinicId)

  const [
    todayAppointmentsCount,
    todayPatientIds,
    newPatientIds,
    waitingCount,
    completedConsultationsToday,
    revenueAgg,
    pendingAgg,
    upcomingAppointments,
  ] = await Promise.all([
    Appointment.countDocuments({ clinicId, scheduledAt: { $gte: start, $lte: end } }),
    Appointment.distinct('patientId', { clinicId, scheduledAt: { $gte: start, $lte: end } }),
    Patient.distinct('_id', { clinicId, createdAt: { $gte: start, $lte: end } }),
    Appointment.countDocuments({
      clinicId,
      scheduledAt: { $gte: start, $lte: end },
      status: 'WAITING',
    }),
    Consultation.countDocuments({ clinicId, createdAt: { $gte: start, $lte: end } }),
    Payment.aggregate([
      { $match: { clinicId: clinicObjectId, paidAt: { $gte: start, $lte: end } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Invoice.aggregate([
      { $match: { clinicId: clinicObjectId, paymentStatus: { $in: ['PENDING', 'PARTIAL'] } } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          amount: { $sum: { $subtract: ['$total', '$amountPaid'] } },
        },
      },
    ]),
    Appointment.find({
      clinicId,
      scheduledAt: { $gt: end, $lte: weekEnd },
      status: 'BOOKED',
    })
      .sort({ scheduledAt: 1 })
      .limit(10)
      .populate('patientId', 'fullName patientId')
      .populate('doctorId', 'name'),
  ])

  const newIdSet = new Set(newPatientIds.map(String))
  const returningPatientsToday = todayPatientIds.filter((id) => !newIdSet.has(String(id))).length

  return {
    role: 'admin',
    todayAppointments: todayAppointmentsCount,
    todayPatients: todayPatientIds.length,
    newPatients: newPatientIds.length,
    returningPatients: returningPatientsToday,
    waitingPatients: waitingCount,
    completedConsultations: completedConsultationsToday,
    todayRevenue: round2(revenueAgg[0]?.total ?? 0),
    pendingPayments: { count: pendingAgg[0]?.count ?? 0, amount: round2(pendingAgg[0]?.amount ?? 0) },
    upcomingAppointments,
  }
}

async function getDoctorDashboard(clinicId, doctorId) {
  const today = todayDateStr()
  const { start, end } = dayRange(today)

  const [
    todayAppointmentsCount,
    waitingCount,
    currentPatient,
    nextPatient,
    completedConsultationsToday,
  ] = await Promise.all([
    Appointment.countDocuments({ clinicId, doctorId, scheduledAt: { $gte: start, $lte: end } }),
    Appointment.countDocuments({
      clinicId,
      doctorId,
      scheduledAt: { $gte: start, $lte: end },
      status: 'WAITING',
    }),
    Appointment.findOne({ clinicId, doctorId, status: 'IN_CONSULTATION' }).populate(
      'patientId',
      'fullName patientId',
    ),
    Appointment.findOne({
      clinicId,
      doctorId,
      scheduledAt: { $gte: start, $lte: end },
      status: 'WAITING',
    })
      .sort({ skipped: 1, tokenNumber: 1 })
      .populate('patientId', 'fullName patientId'),
    Consultation.countDocuments({ clinicId, doctorId, createdAt: { $gte: start, $lte: end } }),
  ])

  return {
    role: 'doctor',
    todayAppointments: todayAppointmentsCount,
    waitingPatients: waitingCount,
    currentPatient,
    nextPatient,
    completedConsultations: completedConsultationsToday,
  }
}

async function getFrontDeskDashboard(clinicId, role) {
  const today = todayDateStr()
  const { start, end } = dayRange(today)

  const [todayAppointmentsCount, waitingCount, todayAppointments] = await Promise.all([
    Appointment.countDocuments({ clinicId, scheduledAt: { $gte: start, $lte: end } }),
    Appointment.countDocuments({
      clinicId,
      scheduledAt: { $gte: start, $lte: end },
      status: 'WAITING',
    }),
    Appointment.find({ clinicId, scheduledAt: { $gte: start, $lte: end } })
      .sort({ scheduledAt: 1 })
      .limit(10)
      .populate('patientId', 'fullName patientId')
      .populate('doctorId', 'name'),
  ])

  return {
    role,
    todayAppointments: todayAppointmentsCount,
    waitingPatients: waitingCount,
    todayAppointmentsList: todayAppointments,
  }
}

export async function getDashboard(clinicId, user) {
  // Owner gets the exact same dashboard shape as admin - the 'admin' role
  // field below is a dashboard-shape discriminator (which component the
  // frontend renders), not an echo of the account's actual role.
  if (user.role === 'owner' || user.role === 'admin') return getAdminDashboard(clinicId)
  if (user.role === 'doctor') return getDoctorDashboard(clinicId, user._id)
  // Receptionist and nurse get the same front-desk-style snapshot - the
  // spec only specs Admin/Doctor/Receptionist dashboards explicitly;
  // nurse isn't described, so it reuses the receptionist shape minus any
  // billing-specific content (there isn't any here to begin with).
  return getFrontDeskDashboard(clinicId, user.role)
}
