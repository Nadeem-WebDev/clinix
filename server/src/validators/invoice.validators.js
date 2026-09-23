import { z } from 'zod'
import { PAYMENT_STATUSES } from '../models/Invoice.js'
import { PAYMENT_METHODS } from '../models/Payment.js'

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id')

const invoiceItemSchema = z.object({
  description: z.string().trim().min(1, 'Description is required'),
  quantity: z.coerce.number().int().min(1),
  unitPrice: z.coerce.number().min(0),
})

export const createInvoiceSchema = z
  .object({
    patientId: objectId,
    doctorId: objectId.optional(),
    appointmentId: objectId.optional(),
    consultationId: objectId.optional(),
    // Optional when consultationId is given - the controller fills in a
    // default "Consultation Fee" item (from Clinic Settings) in that case.
    items: z.array(invoiceItemSchema).min(1, 'Add at least one line item').optional(),
    discount: z.coerce.number().min(0).default(0),
    tax: z.coerce.number().min(0).default(0),
    notes: z.string().trim().optional(),
  })
  .refine((data) => (data.items && data.items.length > 0) || data.consultationId, {
    message: 'Add at least one line item, or link a consultation to auto-fill the consultation fee',
    path: ['items'],
  })

export const updateInvoiceSchema = z.object({
  items: z.array(invoiceItemSchema).min(1, 'Add at least one line item').optional(),
  discount: z.coerce.number().min(0).optional(),
  tax: z.coerce.number().min(0).optional(),
  notes: z.string().trim().optional(),
})

export const recordPaymentSchema = z.object({
  amount: z.coerce.number().min(0.01, 'Amount must be greater than 0'),
  method: z.enum(PAYMENT_METHODS, { errorMap: () => ({ message: 'Select a payment method' }) }),
  notes: z.string().trim().optional(),
})

export const listInvoicesQuerySchema = z.object({
  patientId: objectId.optional(),
  status: z.enum(PAYMENT_STATUSES).optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})
