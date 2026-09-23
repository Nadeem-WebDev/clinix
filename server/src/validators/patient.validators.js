import { z } from 'zod'
import { BLOOD_GROUPS, GENDERS } from '../models/Patient.js'

const emergencyContactSchema = z
  .object({
    name: z.string().trim().optional(),
    phone: z.string().trim().optional(),
  })
  .optional()

const basePatientFields = {
  fullName: z.string().trim().min(2, 'Full name is required'),
  dob: z.coerce.date().optional(),
  age: z.coerce.number().int().min(0).max(150).optional(),
  gender: z.enum(GENDERS, { errorMap: () => ({ message: 'Gender is required' }) }),
  phone: z.string().trim().min(6, 'A valid phone number is required'),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal('')),
  address: z.string().trim().optional(),
  emergencyContact: emergencyContactSchema,
  bloodGroup: z.enum(BLOOD_GROUPS).optional(),
  allergies: z.array(z.string().trim()).optional(),
  medicalConditions: z.array(z.string().trim()).optional(),
  medicalHistory: z.string().trim().optional(),
  notes: z.string().trim().optional(),
}

export const createPatientSchema = z
  .object(basePatientFields)
  .refine((data) => data.dob || data.age !== undefined, {
    message: 'Provide either a date of birth or an age',
    path: ['dob'],
  })

// Same shape, but every field optional (a partial edit doesn't have to
// resend the whole record) - still re-validates whatever IS sent.
export const updatePatientSchema = z.object({
  fullName: basePatientFields.fullName.optional(),
  dob: basePatientFields.dob,
  age: basePatientFields.age,
  gender: basePatientFields.gender.optional(),
  phone: basePatientFields.phone.optional(),
  email: basePatientFields.email,
  address: basePatientFields.address,
  emergencyContact: basePatientFields.emergencyContact,
  bloodGroup: basePatientFields.bloodGroup,
  allergies: basePatientFields.allergies,
  medicalConditions: basePatientFields.medicalConditions,
  medicalHistory: basePatientFields.medicalHistory,
  notes: basePatientFields.notes,
})

export const listPatientsQuerySchema = z.object({
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})
