import { z } from 'zod'

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id')
const dateStr = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')

export const dateRangeQuerySchema = z.object({
  from: dateStr.optional(),
  to: dateStr.optional(),
})

export const appointmentReportQuerySchema = dateRangeQuerySchema.extend({
  doctorId: objectId.optional(),
})

export const revenueReportQuerySchema = dateRangeQuerySchema.extend({
  groupBy: z.enum(['day', 'week', 'month']).default('day'),
})
