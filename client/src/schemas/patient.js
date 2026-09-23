import { z } from 'zod'

export const GENDERS = ['male', 'female', 'other']
export const BLOOD_GROUPS = ['unknown', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

// Form values are all strings (native <input> values) - this schema
// coerces/splits them into the shape the API expects. Kept close to the
// backend's Zod schema so validation errors match what the server would
// say, but expressed in terms a form can produce.
export const patientFormSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Full name is required'),
    dob: z.string().trim().optional(),
    age: z.string().trim().optional(),
    gender: z.enum(GENDERS, { errorMap: () => ({ message: 'Gender is required' }) }),
    phone: z.string().trim().min(6, 'A valid phone number is required'),
    email: z.string().trim().optional(),
    address: z.string().trim().optional(),
    emergencyContactName: z.string().trim().optional(),
    emergencyContactPhone: z.string().trim().optional(),
    bloodGroup: z.enum(BLOOD_GROUPS).optional(),
    allergies: z.string().trim().optional(),
    medicalConditions: z.string().trim().optional(),
    medicalHistory: z.string().trim().optional(),
    notes: z.string().trim().optional(),
  })
  .refine((data) => data.dob || data.age, {
    message: 'Provide either a date of birth or an age',
    path: ['dob'],
  })

export function toPatientPayload(values) {
  const splitList = (value) =>
    value ? value.split(',').map((s) => s.trim()).filter(Boolean) : []

  return {
    fullName: values.fullName,
    ...(values.dob ? { dob: values.dob } : {}),
    ...(values.age ? { age: Number(values.age) } : {}),
    gender: values.gender,
    phone: values.phone,
    ...(values.email ? { email: values.email } : {}),
    ...(values.address ? { address: values.address } : {}),
    ...(values.emergencyContactName || values.emergencyContactPhone
      ? {
          emergencyContact: {
            name: values.emergencyContactName || undefined,
            phone: values.emergencyContactPhone || undefined,
          },
        }
      : {}),
    bloodGroup: values.bloodGroup || 'unknown',
    allergies: splitList(values.allergies),
    medicalConditions: splitList(values.medicalConditions),
    ...(values.medicalHistory ? { medicalHistory: values.medicalHistory } : {}),
    ...(values.notes ? { notes: values.notes } : {}),
  }
}

export function fromPatient(patient) {
  return {
    fullName: patient.fullName ?? '',
    dob: patient.dob ? patient.dob.slice(0, 10) : '',
    age: patient.age != null ? String(patient.age) : '',
    gender: patient.gender ?? 'male',
    phone: patient.phone ?? '',
    email: patient.email ?? '',
    address: patient.address ?? '',
    emergencyContactName: patient.emergencyContact?.name ?? '',
    emergencyContactPhone: patient.emergencyContact?.phone ?? '',
    bloodGroup: patient.bloodGroup ?? 'unknown',
    allergies: (patient.allergies ?? []).join(', '),
    medicalConditions: (patient.medicalConditions ?? []).join(', '),
    medicalHistory: patient.medicalHistory ?? '',
    notes: patient.notes ?? '',
  }
}
