import { z } from 'zod'
import { DAYS_OF_WEEK } from './clinic.js'

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

// One form row per day: the first session, plus an optional second one
// (a morning and an evening OPD). The API stores them as a sessions list.
const doctorDayFormSchema = z
  .object({
    isAvailable: z.boolean(),
    start: z.string(),
    end: z.string(),
    split: z.boolean(),
    start2: z.string(),
    end2: z.string(),
  })
  .superRefine((d, ctx) => {
    if (!d.isAvailable) return
    const issue = (path, message) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message })
    if (!d.start || !d.end || d.start >= d.end) issue('end', 'End time must be after start time')
    if (!d.split) return
    if (!d.start2 || !d.end2 || d.start2 >= d.end2) issue('end2', 'End time must be after start time')
    else if (d.start2 < d.end) issue('start2', 'The second session must start after the first one ends')
  })

export const doctorProfileFormSchema = z.object({
  qualifications: profileText(200),
  specialization: profileText(100),
  registrationNumber: profileText(50),
  registrationCouncil: profileText(100),
  // Blank = the clinic's default fee.
  consultationFee: z
    .string()
    .trim()
    .refine((v) => v === '' || (Number.isFinite(Number(v)) && Number(v) >= 0), 'Enter an amount, or leave blank'),
  hasOwnHours: z.boolean(),
  workingHours: z.array(doctorDayFormSchema).length(7),
})

// A doctor with no hours yet starts from the clinic's opening hours, so
// turning "fixed hours" on only needs the differences.
function hoursFormFrom(profileHours, clinicHours) {
  return DAYS_OF_WEEK.map((day) => {
    const own = profileHours?.find((d) => d.day === day)
    if (own) {
      const [first, second] = own.sessions ?? []
      return {
        isAvailable: own.isAvailable,
        start: first?.start ?? '09:00',
        end: first?.end ?? '13:00',
        split: Boolean(second),
        start2: second?.start ?? '17:00',
        end2: second?.end ?? '20:00',
      }
    }
    const clinicDay = clinicHours?.find((d) => d.day === day)
    return {
      isAvailable: clinicDay ? clinicDay.isOpen : day !== 'sunday',
      start: clinicDay?.openTime ?? '09:00',
      end: clinicDay?.closeTime ?? '18:00',
      split: false,
      start2: '17:00',
      end2: '20:00',
    }
  })
}

export function toDoctorProfileForm(profile, clinic) {
  return {
    qualifications: profile?.qualifications ?? '',
    specialization: profile?.specialization ?? '',
    registrationNumber: profile?.registrationNumber ?? '',
    registrationCouncil: profile?.registrationCouncil ?? '',
    consultationFee: profile?.consultationFee != null ? String(profile.consultationFee) : '',
    hasOwnHours: Boolean(profile?.workingHours?.length),
    workingHours: hoursFormFrom(profile?.workingHours, clinic?.workingHours),
  }
}

// Only an owner/admin may change the fee, so a doctor's own save leaves it out.
export function toDoctorProfilePayload(values, { canEditFee }) {
  return {
    qualifications: values.qualifications,
    specialization: values.specialization,
    registrationNumber: values.registrationNumber,
    registrationCouncil: values.registrationCouncil,
    ...(canEditFee ? { consultationFee: values.consultationFee === '' ? null : Number(values.consultationFee) } : {}),
    workingHours: values.hasOwnHours
      ? values.workingHours.map((d, i) => ({
          day: DAYS_OF_WEEK[i],
          isAvailable: d.isAvailable,
          sessions: d.isAvailable
            ? [{ start: d.start, end: d.end }, ...(d.split ? [{ start: d.start2, end: d.end2 }] : [])]
            : [],
        }))
      : null,
  }
}

// What the "Consultation Fee" line on this doctor's bill starts at.
export function consultationFeeFor(doctor, clinic) {
  return doctor?.doctorProfile?.consultationFee ?? clinic?.defaultConsultationFee ?? 0
}

// "MBBS, MD · General Physician" - for lists and pickers. Empty if neither is on file.
export function doctorCredentials(profile) {
  return [profile?.qualifications, profile?.specialization].filter(Boolean).join(' · ')
}
