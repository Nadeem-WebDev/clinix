import { z } from 'zod'
import { ROLES } from '../models/User.js'

// Shape validation only - which roles a given requester may actually
// assign is enforced in user.service.js's createStaff (it depends on the
// requester's own role, not just the payload shape).
export const createStaffSchema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(ROLES, {
    errorMap: () => ({ message: `Role must be one of: ${ROLES.join(', ')}` }),
  }),
})
