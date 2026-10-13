import mongoose from 'mongoose'
import { PAYMENT_METHODS } from './Payment.js'

// Money given back when an invoice is refunded. Its own record, dated when
// the refund happened, so revenue (reports, dashboard) subtracts it on that
// day instead of rewriting the day the money came in - the way a cash book
// shows it. One per original payment, carrying that payment's method, so
// "by payment method" nets out too: cash goes back off cash, UPI off UPI.
const refundSchema = new mongoose.Schema(
  {
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Clinic',
      required: true,
      index: true,
    },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', required: true },
    amount: { type: Number, required: true, min: 0.01 },
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    refundedAt: { type: Date, default: Date.now },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
)

// A payment can only be given back once - also what makes the backfill
// script safe to re-run.
refundSchema.index({ paymentId: 1 }, { unique: true })
refundSchema.index({ clinicId: 1, refundedAt: -1 })

export const Refund = mongoose.model('Refund', refundSchema)
