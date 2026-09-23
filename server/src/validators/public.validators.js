import { z } from 'zod'
import { SLUG_PATTERN } from '../utils/slug.js'

// The slug is the tenant lookup key on an unauthenticated route, so it is
// validated in shape before it ever reaches a query. The pattern is the
// same one Clinic.slug enforces on write, so anything rejected here could
// not have matched a stored clinic anyway.
export const publicQueueParamsSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(64)
    .regex(SLUG_PATTERN, 'Invalid clinic link'),
})

export const publicQueueQuerySchema = z.object({
  // YYYY-MM-DD, same single-day filter the internal queue takes. Optional -
  // defaults to today, which is what a waiting-room screen always wants.
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .optional(),
})
