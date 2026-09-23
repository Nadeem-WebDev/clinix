import mongoose from 'mongoose'

export const PAYMENT_METHODS = ['CASH', 'UPI', 'CARD', 'ONLINE', 'OTHER']

// A first-class collection (not embedded in Invoice) - matches the
// spec's own modeling ("A payment belongs to: Clinic, Invoice") and keeps
// revenue/payment-method reporting (Phase 8) a simple aggregation instead
// of an array $unwind.
const paymentSchema = new mongoose.Schema(
  {
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Clinic',
      required: true,
      index: true,
    },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true },
    amount: { type: Number, required: true, min: 0.01 },
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    paidAt: { type: Date, default: Date.now },
    notes: { type: String, trim: true },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
)

paymentSchema.index({ clinicId: 1, invoiceId: 1 })
paymentSchema.index({ clinicId: 1, paidAt: -1 })
paymentSchema.index({ clinicId: 1, method: 1 })

export const Payment = mongoose.model('Payment', paymentSchema)
