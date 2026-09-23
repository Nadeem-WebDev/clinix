import mongoose from 'mongoose'
import { Patient } from '../models/Patient.js'
import { Appointment } from '../models/Appointment.js'
import { Payment } from '../models/Payment.js'
import { User } from '../models/User.js'
import { resolveDateRange } from '../utils/dateRange.js'

function round2(n) {
  return Math.round(n * 100) / 100
}

export async function getPatientReport(clinicId, { from, to }) {
  const { fromStr, toStr, start, end } = resolveDateRange({ from, to })

  const [totalPatients, newPatientIdsInRange, patientIdsWithAppointments, byDate] =
    await Promise.all([
      Patient.countDocuments({ clinicId }),
      Patient.distinct('_id', { clinicId, createdAt: { $gte: start, $lte: end } }),
      Appointment.distinct('patientId', { clinicId, scheduledAt: { $gte: start, $lte: end } }),
      Patient.aggregate([
        { $match: { clinicId: new mongoose.Types.ObjectId(clinicId), createdAt: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } },
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
  const { fromStr, toStr, start, end } = resolveDateRange({ from, to })
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
  const { fromStr, toStr, start, end } = resolveDateRange({ from, to })
  const dateFormat = GROUP_FORMATS[groupBy] ?? GROUP_FORMATS.day
  const clinicObjectId = new mongoose.Types.ObjectId(clinicId)

  const [totalAgg, series, byMethodAgg, byDoctorAgg] = await Promise.all([
    Payment.aggregate([
      { $match: { clinicId: clinicObjectId, paidAt: { $gte: start, $lte: end } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Payment.aggregate([
      { $match: { clinicId: clinicObjectId, paidAt: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: { $dateToString: { format: dateFormat, date: '$paidAt', timezone: 'UTC' } },
          total: { $sum: '$amount' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Payment.aggregate([
      { $match: { clinicId: clinicObjectId, paidAt: { $gte: start, $lte: end } } },
      { $group: { _id: '$method', total: { $sum: '$amount' } } },
      { $sort: { total: -1 } },
    ]),
    // Payment doesn't carry doctorId directly - join to its invoice to
    // get one. This is exactly the aggregation the separate Payment
    // collection (rather than an array embedded in Invoice) was chosen
    // to make simple.
    Payment.aggregate([
      { $match: { clinicId: clinicObjectId, paidAt: { $gte: start, $lte: end } } },
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
    byMethod: byMethodAgg.map((m) => ({ method: m._id, total: round2(m.total) })),
    byDoctor: byDoctorAgg.map((d) => ({
      doctorId: d._id,
      doctorName: doctorNameById.get(String(d._id)) ?? 'Unknown',
      total: round2(d.total),
    })),
  }
}
