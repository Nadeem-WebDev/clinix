import mongoose from 'mongoose'
import { Invoice } from '../models/Invoice.js'
import { Payment } from '../models/Payment.js'
import { Patient } from '../models/Patient.js'
import { User } from '../models/User.js'
import { Appointment } from '../models/Appointment.js'
import { Consultation } from '../models/Consultation.js'
import { nextSequence } from '../models/Counter.js'
import { ApiError } from '../utils/ApiError.js'
import * as whatsapp from './whatsapp.service.js'

function assertValidId(id, label = 'id') {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw ApiError.badRequest(`Invalid ${label}`, 'INVALID_ID')
  }
}

function round2(n) {
  return Math.round(n * 100) / 100
}

// Invoice total must be calculated server-side (spec section 26) - a
// client-sent amount/subtotal/total is never trusted, only recomputed here.
function computeTotals(items, discount, tax) {
  const withAmounts = items.map((item) => ({
    ...item,
    amount: round2(item.quantity * item.unitPrice),
  }))
  const subtotal = round2(withAmounts.reduce((sum, item) => sum + item.amount, 0))
  const total = round2(Math.max(0, subtotal - discount + tax))
  return { items: withAmounts, subtotal, total }
}

async function assertReferences(clinicId, { patientId, doctorId, appointmentId, consultationId }) {
  const patient = await Patient.findOne({ _id: patientId, clinicId })
  if (!patient) throw ApiError.badRequest('Patient not found in this clinic', 'PATIENT_NOT_FOUND')

  if (doctorId) {
    const doctor = await User.findOne({ _id: doctorId, clinicId, active: true })
    if (!doctor || doctor.role !== 'doctor') {
      throw ApiError.badRequest('Doctor not found in this clinic', 'DOCTOR_NOT_FOUND')
    }
  }
  if (appointmentId) {
    const appointment = await Appointment.findOne({ _id: appointmentId, clinicId })
    if (!appointment) {
      throw ApiError.badRequest('Appointment not found in this clinic', 'APPOINTMENT_NOT_FOUND')
    }
    if (String(appointment.patientId) !== String(patientId)) {
      throw ApiError.badRequest('This appointment does not belong to the given patient', 'APPOINTMENT_MISMATCH')
    }
  }
  if (consultationId) {
    const consultation = await Consultation.findOne({ _id: consultationId, clinicId })
    if (!consultation) {
      throw ApiError.badRequest('Consultation not found in this clinic', 'CONSULTATION_NOT_FOUND')
    }
    if (String(consultation.patientId) !== String(patientId)) {
      throw ApiError.badRequest(
        'This consultation does not belong to the given patient',
        'CONSULTATION_MISMATCH',
      )
    }
  }
}

async function generateInvoiceNumber(clinicId) {
  const seq = await nextSequence(clinicId, 'invoiceNumber')
  return `INV-${1000 + seq}`
}

async function populateInvoice(invoice) {
  return invoice.populate([
    { path: 'patientId', select: 'fullName patientId dob age gender phone' },
    { path: 'doctorId', select: 'name' },
  ])
}

export async function createInvoice(clinicId, data, createdByUserId) {
  await assertReferences(clinicId, data)
  const { items, subtotal, total } = computeTotals(data.items, data.discount ?? 0, data.tax ?? 0)
  const invoiceNumber = await generateInvoiceNumber(clinicId)

  const invoice = await Invoice.create({
    clinicId,
    patientId: data.patientId,
    doctorId: data.doctorId,
    appointmentId: data.appointmentId,
    consultationId: data.consultationId,
    invoiceNumber,
    items,
    subtotal,
    discount: data.discount ?? 0,
    tax: data.tax ?? 0,
    total,
    notes: data.notes,
    createdBy: createdByUserId,
  })
  return populateInvoice(invoice)
}

export async function listInvoices(clinicId, { patientId, status, from, to, page, limit }) {
  const filter = { clinicId }
  if (patientId) filter.patientId = patientId
  if (status) filter.paymentStatus = status
  if (from || to) {
    filter.createdAt = {}
    if (from) filter.createdAt.$gte = new Date(`${from}T00:00:00.000Z`)
    if (to) filter.createdAt.$lte = new Date(`${to}T23:59:59.999Z`)
  }

  const skip = (page - 1) * limit
  const [invoices, total] = await Promise.all([
    Invoice.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('patientId', 'fullName patientId')
      .populate('doctorId', 'name'),
    Invoice.countDocuments(filter),
  ])

  return {
    invoices,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  }
}

async function findOwned(clinicId, id) {
  assertValidId(id, 'invoice id')
  const invoice = await Invoice.findOne({ _id: id, clinicId })
  if (!invoice) throw ApiError.notFound('Invoice not found')
  return invoice
}

export async function getInvoiceById(clinicId, id) {
  assertValidId(id, 'invoice id')
  const invoice = await Invoice.findOne({ _id: id, clinicId })
    .populate('patientId', 'fullName patientId dob age gender phone')
    .populate('doctorId', 'name')
  if (!invoice) throw ApiError.notFound('Invoice not found')
  return invoice
}

// Line items are locked once any money has actually changed hands -
// rewriting a partially/fully paid invoice's charges would corrupt the
// historical record a payment was made against. Discount/tax/notes are
// likewise locked at that point for the same reason.
export async function updateInvoice(clinicId, id, data) {
  const invoice = await findOwned(clinicId, id)
  if (invoice.amountPaid > 0) {
    throw ApiError.badRequest(
      'This invoice has payments recorded and can no longer be edited',
      'INVOICE_HAS_PAYMENTS',
    )
  }

  const items = data.items ?? invoice.items
  const discount = data.discount ?? invoice.discount
  const tax = data.tax ?? invoice.tax
  const totals = computeTotals(items, discount, tax)

  invoice.items = totals.items
  invoice.subtotal = totals.subtotal
  invoice.discount = discount
  invoice.tax = tax
  invoice.total = totals.total
  if (data.notes !== undefined) invoice.notes = data.notes
  await invoice.save()
  return populateInvoice(invoice)
}

export async function recordPayment(clinicId, id, { amount, method, notes }, recordedByUserId) {
  const invoice = await findOwned(clinicId, id)
  if (invoice.paymentStatus === 'REFUNDED') {
    throw ApiError.badRequest('This invoice has been refunded', 'INVOICE_REFUNDED')
  }
  const balance = round2(invoice.total - invoice.amountPaid)
  if (amount > balance) {
    throw ApiError.badRequest(
      `Payment amount cannot exceed the remaining balance (${balance})`,
      'PAYMENT_EXCEEDS_BALANCE',
    )
  }

  const payment = await Payment.create({
    clinicId,
    invoiceId: invoice._id,
    amount,
    method,
    notes,
    recordedBy: recordedByUserId,
  })

  invoice.amountPaid = round2(invoice.amountPaid + amount)
  invoice.paymentStatus = invoice.amountPaid >= invoice.total ? 'PAID' : 'PARTIAL'
  await invoice.save()

  // Only on the payment that settles the invoice, not on every partial
  // one: "your receipt is ready" is untrue while a balance is outstanding,
  // and a bill paid in three instalments should not produce three
  // notifications. Fire-and-forget - recording a payment must never fail
  // because of a messaging problem.
  if (invoice.paymentStatus === 'PAID') {
    whatsapp.notifyDocumentReady({
      clinicId: invoice.clinicId,
      patientId: invoice.patientId,
      documentType: 'receipt',
      resourceType: 'Invoice',
      resourceId: invoice._id,
    })
  }

  return { invoice: await populateInvoice(invoice), payment }
}

export async function listPayments(clinicId, invoiceId) {
  assertValidId(invoiceId, 'invoice id')
  return Payment.find({ clinicId, invoiceId }).sort({ paidAt: -1 })
}

export async function refundInvoice(clinicId, id) {
  const invoice = await findOwned(clinicId, id)
  if (invoice.paymentStatus === 'REFUNDED') {
    throw ApiError.badRequest('This invoice is already refunded', 'INVOICE_REFUNDED')
  }
  // A flag flip, not a full reversing-ledger entry - proper credit
  // notes/partial refunds are exactly the accounting-ERP complexity the
  // spec says to skip for the MVP.
  invoice.paymentStatus = 'REFUNDED'
  await invoice.save()
  return populateInvoice(invoice)
}
