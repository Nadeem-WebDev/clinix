import { z } from 'zod'

// Same default as the server (utils/dateRange.js DEFAULT_TIMEZONE).
export const DEFAULT_CLINIC_TIMEZONE = 'Asia/Kolkata'

// Every zone the browser knows, plus the default and the clinic's saved one:
// some engines (Chrome, Node 18) list India as the older alias
// 'Asia/Calcutta', and an old browser may have no list at all.
export function timeZoneOptions(current) {
  const supported = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
  return [...new Set([current, DEFAULT_CLINIC_TIMEZONE, ...supported].filter(Boolean))].sort()
}

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
  email: z.union([z.string().trim().email('Enter a valid email address'), z.literal('')]),
  defaultConsultationFee: z.coerce.number().min(0, 'Must be 0 or more'),
  workingHours: z.array(workingHourFormSchema).length(7),
  whatsappEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  timezone: z.string().min(1, 'Choose a time zone'),
})

// workingHours is always kept in DAYS_OF_WEEK order, so the day itself
// doesn't need to round-trip through the form - toClinicPayload restores
// it from each entry's index.
export function fromClinic(clinic) {
  return {
    name: clinic.name ?? '',
    address: clinic.address ?? '',
    phone: clinic.phone ?? '',
    email: clinic.email ?? '',
    defaultConsultationFee: clinic.defaultConsultationFee ?? 0,
    whatsappEnabled: clinic.whatsappEnabled ?? false,
    emailEnabled: clinic.emailEnabled ?? false,
    timezone: clinic.timezone ?? DEFAULT_CLINIC_TIMEZONE,
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
    email: values.email ?? '',
    defaultConsultationFee: Number(values.defaultConsultationFee),
    whatsappEnabled: Boolean(values.whatsappEnabled),
    emailEnabled: Boolean(values.emailEnabled),
    timezone: values.timezone,
    workingHours: values.workingHours.map((wh, index) => ({
      day: DAYS_OF_WEEK[index],
      isOpen: Boolean(wh.isOpen),
      openTime: wh.openTime,
      closeTime: wh.closeTime,
    })),
  }
}
