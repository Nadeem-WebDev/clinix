import mongoose from 'mongoose'

export const PAYMENT_STATUSES = ['PENDING', 'PARTIAL', 'PAID', 'REFUNDED']

const invoiceItemSchema = new mongoose.Schema(
  {
    description: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    // Computed server-side (quantity * unitPrice) - never trust a
    // client-sent amount for a line item, same as the invoice total.
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false },
)

const invoiceSchema = new mongoose.Schema(
  {
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Clinic',
      required: true,
      index: true,
    },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
    consultationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Consultation' },
    // Human-friendly, clinic-scoped identifier (e.g. "INV-1001"), same
    // Counter-backed pattern as Patient.patientId.
    invoiceNumber: { type: String, required: true },
    items: { type: [invoiceItemSchema], default: [] },
    subtotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    // subtotal - discount + tax, computed server-side.
    total: { type: Number, required: true, min: 0 },
    amountPaid: { type: Number, default: 0, min: 0 },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'PENDING' },
    notes: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
)

invoiceSchema.index({ clinicId: 1, invoiceNumber: 1 }, { unique: true })
invoiceSchema.index({ clinicId: 1, patientId: 1, createdAt: -1 })
invoiceSchema.index({ clinicId: 1, paymentStatus: 1 })
invoiceSchema.index({ clinicId: 1, createdAt: -1 })

export const Invoice = mongoose.model('Invoice', invoiceSchema)
