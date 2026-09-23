import { z } from 'zod'

// Deliberately excludes 'owner'/'admin' - the Staff page only lets an
// owner create the day-to-day roles. Granting admin/owner-level access is
// an owner-only, API-only action for now (see server/src/services/user.service.js).
export const STAFF_ROLES = ['doctor', 'receptionist', 'nurse']

export const staffFormSchema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(STAFF_ROLES, { errorMap: () => ({ message: 'Select a role' }) }),
})
