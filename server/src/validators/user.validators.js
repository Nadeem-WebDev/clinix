import { z } from 'zod'
import { ROLES } from '../models/User.js'
import { DAYS_OF_WEEK } from '../models/Clinic.js'

// Shape validation only - which roles a given requester may actually
// assign is enforced in user.service.js's createStaff (it depends on the
// requester's own role, not just the payload shape).
const profileText = (max) => z.string().trim().max(max, `Keep this under ${max} characters`).optional()

const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:mm format')

const doctorDaySchema = z
  .object({
    day: z.enum(DAYS_OF_WEEK),
    isAvailable: z.boolean(),
    sessions: z
      .array(z.object({ start: timeString, end: timeString }))
      .max(2, 'At most two sessions a day'),
  })
  .superRefine((d, ctx) => {
    if (!d.isAvailable) return
    if (d.sessions.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sessions'], message: 'Add the hours for this day' })
    }
    d.sessions.forEach((s, i) => {
      if (s.start >= s.end) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sessions', i, 'end'], message: 'End time must be after start time' })
      }
    })
    const [first, second] = d.sessions
    if (second && second.start < first.end) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sessions', 1, 'start'],
        message: 'The second session must start after the first one ends',
      })
    }
  })

// Every field optional: a PATCH sends what changed. An empty string clears
// a text field; null clears the fee (back to the clinic default) or the
// hours (back to "no fixed hours").
export const doctorProfileSchema = z
  .object({
    qualifications: profileText(200),
    specialization: profileText(100),
    registrationNumber: profileText(50),
    registrationCouncil: profileText(100),
    consultationFee: z.number().min(0, 'The fee cannot be negative').max(1000000).nullable().optional(),
    workingHours: z
      .array(doctorDaySchema)
      .length(7, 'Provide hours for all 7 days')
      .refine((days) => DAYS_OF_WEEK.every((day, i) => days[i]?.day === day), 'Days must be in order, Monday first')
      .nullable()
      .optional(),
  })
  .strict()

export const createStaffSchema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(ROLES, {
    errorMap: () => ({ message: `Role must be one of: ${ROLES.join(', ')}` }),
  }),
})
