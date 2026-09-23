import { z } from 'zod'

export const DAYS_OF_WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm format')

const workingHourFormSchema = z
  .object({
    isOpen: z.boolean(),
    openTime: timeString,
    closeTime: timeString,
  })
  .refine((d) => !d.isOpen || d.openTime < d.closeTime, {
    message: 'Opening time must be before closing time',
    path: ['closeTime'],
  })

export const clinicSettingsFormSchema = z.object({
  name: z.string().trim().min(2, 'Clinic name is required'),
  address: z.string().trim().optional(),
  phone: z.string().trim().min(6, 'A valid phone number is required'),
  defaultConsultationFee: z.coerce.number().min(0, 'Must be 0 or more'),
  workingHours: z.array(workingHourFormSchema).length(7),
  whatsappEnabled: z.boolean(),
})

// workingHours is always kept in DAYS_OF_WEEK order, so the day itself
// doesn't need to round-trip through the form - toClinicPayload restores
// it from each entry's index.
export function fromClinic(clinic) {
  return {
    name: clinic.name ?? '',
    address: clinic.address ?? '',
    phone: clinic.phone ?? '',
    defaultConsultationFee: clinic.defaultConsultationFee ?? 0,
    whatsappEnabled: clinic.whatsappEnabled ?? false,
    workingHours: DAYS_OF_WEEK.map((day) => {
      const existing = clinic.workingHours?.find((wh) => wh.day === day)
      return {
        isOpen: existing?.isOpen ?? true,
        openTime: existing?.openTime ?? '09:00',
        closeTime: existing?.closeTime ?? '18:00',
      }
    }),
  }
}

export function toClinicPayload(values) {
  return {
    name: values.name,
    address: values.address || undefined,
    phone: values.phone,
    defaultConsultationFee: Number(values.defaultConsultationFee),
    whatsappEnabled: Boolean(values.whatsappEnabled),
    workingHours: values.workingHours.map((wh, index) => ({
      day: DAYS_OF_WEEK[index],
      isOpen: Boolean(wh.isOpen),
      openTime: wh.openTime,
      closeTime: wh.closeTime,
    })),
  }
}
