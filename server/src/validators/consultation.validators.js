import { z } from 'zod'

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id')

const vitalsSchema = z
  .object({
    temperature: z.string().trim().optional(),
    bloodPressure: z.string().trim().optional(),
    pulse: z.string().trim().optional(),
    respiratoryRate: z.string().trim().optional(),
    spo2: z.string().trim().optional(),
    weight: z.string().trim().optional(),
    height: z.string().trim().optional(),
  })
  .optional()

const clinicalFields = {
  chiefComplaint: z.string().trim().optional(),
  vitals: vitalsSchema,
  symptoms: z.string().trim().optional(),
  examinationNotes: z.string().trim().optional(),
  diagnosis: z.string().trim().optional(),
  treatmentPlan: z.string().trim().optional(),
  doctorNotes: z.string().trim().optional(),
  followUpDate: z.coerce.date().optional(),
  followUpInstructions: z.string().trim().optional(),
}

export const createConsultationSchema = z.object({
  patientId: objectId,
  doctorId: objectId,
  appointmentId: objectId.optional(),
  ...clinicalFields,
})

export const updateConsultationSchema = z.object(clinicalFields)

export const listConsultationsQuerySchema = z.object({
  patientId: objectId.optional(),
  doctorId: objectId.optional(),
  appointmentId: objectId.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})
