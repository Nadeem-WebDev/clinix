import { z } from 'zod'
import { ROLES } from '../models/User.js'

// Shape validation only - which roles a given requester may actually
// assign is enforced in user.service.js's createStaff (it depends on the
// requester's own role, not just the payload shape).
const profileText = (max) => z.string().trim().max(max, `Keep this under ${max} characters`).optional()

// Every field optional: a PATCH sends what changed. An empty string clears.
export const doctorProfileSchema = z
  .object({
    qualifications: profileText(200),
    specialization: profileText(100),
    registrationNumber: profileText(50),
    registrationCouncil: profileText(100),
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
