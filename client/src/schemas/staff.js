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

const profileText = (max) => z.string().trim().max(max, `Keep this under ${max} characters`)

export const doctorProfileFormSchema = z.object({
  qualifications: profileText(200),
  specialization: profileText(100),
  registrationNumber: profileText(50),
  registrationCouncil: profileText(100),
})

export function toDoctorProfileForm(profile) {
  return {
    qualifications: profile?.qualifications ?? '',
    specialization: profile?.specialization ?? '',
    registrationNumber: profile?.registrationNumber ?? '',
    registrationCouncil: profile?.registrationCouncil ?? '',
  }
}

// "MBBS, MD · General Physician" - for lists and pickers. Empty if neither is on file.
export function doctorCredentials(profile) {
  return [profile?.qualifications, profile?.specialization].filter(Boolean).join(' · ')
}
