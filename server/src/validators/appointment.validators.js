import { z } from 'zod'
import { APPOINTMENT_STATUSES } from '../models/Appointment.js'

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id')

export const createAppointmentSchema = z.object({
  patientId: objectId,
  doctorId: objectId,
  scheduledAt: z.coerce.date({ errorMap: () => ({ message: 'A valid date/time is required' }) }),
  durationMinutes: z.coerce.number().int().min(5).max(480).optional(),
  notes: z.string().trim().optional(),
  isWalkIn: z.boolean().optional(),
})

export const rescheduleAppointmentSchema = z.object({
  scheduledAt: z.coerce.date().optional(),
  durationMinutes: z.coerce.number().int().min(5).max(480).optional(),
  notes: z.string().trim().optional(),
})

export const listAppointmentsQuerySchema = z.object({
  date: z.string().trim().optional(), // YYYY-MM-DD, single-day filter
  from: z.string().trim().optional(), // YYYY-MM-DD, range start (inclusive)
  to: z.string().trim().optional(), // YYYY-MM-DD, range end (inclusive)
  doctorId: objectId.optional(),
  patientId: objectId.optional(),
  status: z.enum(APPOINTMENT_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const queueQuerySchema = z.object({
  doctorId: objectId.optional(),
  date: z.string().trim().optional(),
})
