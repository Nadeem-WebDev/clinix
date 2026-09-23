import { z } from 'zod'
import { DAYS_OF_WEEK } from '../models/Clinic.js'

const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:mm format')

const workingHourSchema = z
  .object({
    day: z.enum(DAYS_OF_WEEK),
    isOpen: z.boolean(),
    openTime: timeString,
    closeTime: timeString,
  })
  .refine((d) => !d.isOpen || d.openTime < d.closeTime, {
    message: 'Opening time must be before closing time',
    path: ['closeTime'],
  })

// Partial update, like updatePatientSchema - only fields the form actually
// sends get re-validated and written.
export const updateClinicSettingsSchema = z.object({
  name: z.string().trim().min(2, 'Clinic name is required').optional(),
  address: z.string().trim().optional(),
  phone: z.string().trim().min(6, 'A valid phone number is required').optional(),
  defaultConsultationFee: z.coerce.number().min(0).optional(),
  workingHours: z.array(workingHourSchema).length(7, 'Provide hours for all 7 days').optional(),
  // Per-clinic WhatsApp toggle. Meta credentials and template approval are
  // platform-level configuration, so this is the only WhatsApp setting a
  // clinic owner can change.
  whatsappEnabled: z.boolean().optional(),
})
