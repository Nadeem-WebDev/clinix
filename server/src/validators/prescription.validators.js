import { z } from 'zod'

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id')

const medicineSchema = z.object({
  name: z.string().trim().min(1, 'Medicine name is required'),
  dosage: z.string().trim().optional(),
  frequency: z.string().trim().optional(),
  route: z.string().trim().optional(),
  timing: z.string().trim().optional(),
  duration: z.string().trim().optional(),
  instructions: z.string().trim().optional(),
  quantity: z.string().trim().optional(),
})

export const createPrescriptionSchema = z.object({
  patientId: objectId,
  doctorId: objectId,
  consultationId: objectId,
  medicines: z.array(medicineSchema).min(1, 'Add at least one medicine'),
  notes: z.string().trim().optional(),
})

export const updatePrescriptionSchema = z.object({
  medicines: z.array(medicineSchema).min(1, 'Add at least one medicine').optional(),
  notes: z.string().trim().optional(),
})

export const listPrescriptionsQuerySchema = z.object({
  patientId: objectId.optional(),
  doctorId: objectId.optional(),
  consultationId: objectId.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})
