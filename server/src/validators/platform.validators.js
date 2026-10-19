import { z } from 'zod'
import { PLAN_CODES } from '../config/plans.js'

export const platformLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

export const suspendClinicSchema = z.object({
  reason: z.string().trim().min(3, 'Give a short reason').max(300),
})

// A clinic's subscription, set by hand: extend its trial, or put it on a
// plan it pays for outside Razorpay (bank transfer) or gets free. null
// clears a field.
const dateOrNull = z.union([z.coerce.date({ errorMap: () => ({ message: 'Enter a valid date' }) }), z.null()])

export const billingOverrideSchema = z
  .object({
    trialEndsAt: dateOrNull.optional(),
    manualPlan: z.union([z.enum(PLAN_CODES), z.null()]).optional(),
    manualPaidUntil: dateOrNull.optional(),
    manualNote: z.string().trim().max(300).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change')
  .refine((v) => !v.manualPaidUntil || v.manualPlan !== null, { message: 'Choose the plan they paid for', path: ['manualPlan'] })
