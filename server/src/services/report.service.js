import mongoose from 'mongoose'
import { Patient } from '../models/Patient.js'
import { Appointment } from '../models/Appointment.js'
import { Payment } from '../models/Payment.js'
import { Refund } from '../models/Refund.js'
import { User } from '../models/User.js'
import { resolveDateRange } from '../utils/dateRange.js'
import { getClinicTimezone } from './clinic.service.js'

function round2(n) {
  return Math.round(n * 100) / 100
}

// The opening stages of every revenue figure (reports and the dashboard):
// money in minus money given back. Payments count on the day they were
// paid; refunds count as negative amounts on the day they were refunded.
// So a refund never rewrites an earlier day's figures - it shows up on its
// own day, the way a cash book would. Each entry comes out as
// { invoiceId, method, amount, at }; run it as Payment.aggregate([...]).
export function revenueEntriesPipeline(clinicObjectId, start, end) {
  return [
    { $match: { clinicId: clinicObjectId, paidAt: { $gte: start, $lte: end } } },
    { $project: { _id: 0, invoiceId: 1, method: 1, amount: 1, at: '$paidAt' } },
    {
      $unionWith: {
        coll: Refund.collection.name,
        pipeline: [
          { $match: { clinicId: clinicObjectId, refundedAt: { $gte: start, $lte: end } } },
          {
            $project: {
              _id: 0,
              invoiceId: 1,
              method: 1,
              amount: { $multiply: ['$amount', -1] },
              at: '$refundedAt',
            },
          },
        ],
      },
    },
  ]
}

export async function getPatientReport(clinicId, { from, to }) {
  const tz = await getClinicTimezone(clinicId)
  const { fromStr, toStr, start, end } = resolveDateRange({ from, to }, tz)

  const [totalPatients, newPatientIdsInRange, patientIdsWithAppointments, byDate] =
    await Promise.all([
      Patient.countDocuments({ clinicId }),
      Patient.distinct('_id', { clinicId, createdAt: { $gte: start, $lte: end } }),
      Appointment.distinct('patientId', { clinicId, scheduledAt: { $gte: start, $lte: end } }),
      Patient.aggregate([
        { $match: { clinicId: new mongoose.Types.ObjectId(clinicId), createdAt: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: tz } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ])

  const newIdSet = new Set(newPatientIdsInRange.map(String))
  const returningPatients = patientIdsWithAppointments.filter((id) => !newIdSet.has(String(id))).length

  return {
    range: { from: fromStr, to: toStr },
    totalPatients,
    newPatients: newPatientIdsInRange.length,
    returningPatients,
    newPatientsByDate: byDate.map((d) => ({ date: d._id, count: d.count })),
  }
}

export async function getAppointmentReport(clinicId, { from, to, doctorId }) {
  const tz = await getClinicTimezone(clinicId)
  const { fromStr, toStr, start, end } = resolveDateRange({ from, to }, tz)
  const filter = {
    clinicId: new mongoose.Types.ObjectId(clinicId),
    scheduledAt: { $gte: start, $lte: end },
    ...(doctorId ? { doctorId: new mongoose.Types.ObjectId(doctorId) } : {}),
  }

  const [total, completed, cancelled, noShow, byDoctorAgg] = await Promise.all([
    Appointment.countDocuments(filter),
    Appointment.countDocuments({ ...filter, status: 'COMPLETED' }),
    Appointment.countDocuments({ ...filter, status: 'CANCELLED' }),
    Appointment.countDocuments({ ...filter, status: 'NO_SHOW' }),
    Appointment.aggregate([
      { $match: filter },
      { $group: { _id: '$doctorId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
  ])

  const doctors = await User.find({ _id: { $in: byDoctorAgg.map((d) => d._id) } }, 'name')
  const doctorNameById = new Map(doctors.map((d) => [String(d._id), d.name]))

  return {
    range: { from: fromStr, to: toStr },
    total,
    completed,
    cancelled,
    noShow,
    byDoctor: byDoctorAgg.map((d) => ({
      doctorId: d._id,
      doctorName: doctorNameById.get(String(d._id)) ?? 'Unknown',
      count: d.count,
    })),
  }
}

const GROUP_FORMATS = {
  day: '%Y-%m-%d',
  week: '%G-W%V',
  month: '%Y-%m',
}

export async function getRevenueReport(clinicId, { from, to, groupBy = 'day' }) {
  const tz = await getClinicTimezone(clinicId)
  const { fromStr, toStr, start, end } = resolveDateRange({ from, to }, tz)
  const dateFormat = GROUP_FORMATS[groupBy] ?? GROUP_FORMATS.day
  const clinicObjectId = new mongoose.Types.ObjectId(clinicId)
  const entries = revenueEntriesPipeline(clinicObjectId, start, end)

  const [totalAgg, series, byMethodAgg, byDoctorAgg] = await Promise.all([
    Payment.aggregate([...entries, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Payment.aggregate([
      ...entries,
      {
        $group: {
          _id: { $dateToString: { format: dateFormat, date: '$at', timezone: tz } },
          total: { $sum: '$amount' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Payment.aggregate([
      ...entries,
      { $group: { _id: '$method', total: { $sum: '$amount' } } },
      { $sort: { total: -1 } },
    ]),
    // Neither payments nor refunds carry doctorId directly - join to the
    // invoice to get one. This is exactly the aggregation the separate
    // Payment collection (rather than an array embedded in Invoice) was
    // chosen to make simple.
    Payment.aggregate([
      ...entries,
      {
        $lookup: {
          from: 'invoices',
          localField: 'invoiceId',
          foreignField: '_id',
          as: 'invoice',
        },
      },
      { $unwind: '$invoice' },
      { $match: { 'invoice.doctorId': { $ne: null } } },
      { $group: { _id: '$invoice.doctorId', total: { $sum: '$amount' } } },
      { $sort: { total: -1 } },
    ]),
  ])

  const doctors = await User.find({ _id: { $in: byDoctorAgg.map((d) => d._id) } }, 'name')
  const doctorNameById = new Map(doctors.map((d) => [String(d._id), d.name]))

  return {
    range: { from: fromStr, to: toStr },
    groupBy,
    total: round2(totalAgg[0]?.total ?? 0),
    series: series.map((s) => ({ period: s._id, total: round2(s.total) })),
    // A method or doctor whose takings were all refunded in this range nets
    // to 0 - left out, like one with no payments at all.
    byMethod: byMethodAgg
      .map((m) => ({ method: m._id, total: round2(m.total) }))
      .filter((m) => m.total !== 0),
    byDoctor: byDoctorAgg
      .map((d) => ({
        doctorId: d._id,
        doctorName: doctorNameById.get(String(d._id)) ?? 'Unknown',
        total: round2(d.total),
      }))
      .filter((d) => d.total !== 0),
  }
}
