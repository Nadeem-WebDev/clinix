import { z } from 'zod'
import { GENDERS } from './patient.js'
import { localDateStr } from '../utils/date.js'

export const appointmentFormSchema = z.object({
  patientId: z.string().min(1, 'Select a patient'),
  doctorId: z.string().min(1, 'Select a doctor'),
  date: z.string().min(1, 'Date is required'),
  time: z.string().min(1, 'Time is required'),
  durationMinutes: z.string().trim().optional(),
  notes: z.string().trim().optional(),
})

export function toAppointmentPayload(values) {
  return {
    patientId: values.patientId,
    doctorId: values.doctorId,
    scheduledAt: new Date(`${values.date}T${values.time}:00`).toISOString(),
    ...(values.durationMinutes ? { durationMinutes: Number(values.durationMinutes) } : {}),
    ...(values.notes ? { notes: values.notes } : {}),
  }
}

export function todayDateStr() {
  return localDateStr()
}

// Walk-in pop-up: either an existing patient, or the bare minimum to
// register a new one at the desk (the same fields the patient API
// requires - full details can be added from their profile later).
export const walkInFormSchema = z
  .object({
    mode: z.enum(['existing', 'new']),
    patientId: z.string().optional(),
    fullName: z.string().trim().optional(),
    phone: z.string().trim().optional(),
    age: z.string().trim().optional(),
    gender: z.string().optional(),
    doctorId: z.string().min(1, 'Select a doctor'),
  })
  .superRefine((values, ctx) => {
    const issue = (path, message) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message })
    if (values.mode === 'existing') {
      if (!values.patientId) issue('patientId', 'Select a patient')
      return
    }
    if (!values.fullName || values.fullName.length < 2) issue('fullName', 'Full name is required')
    if (!values.phone || values.phone.length < 6) issue('phone', 'A valid phone number is required')
    const age = Number(values.age)
    if (!values.age || !Number.isInteger(age) || age < 0 || age > 130) issue('age', 'Enter an age in years')
    if (!GENDERS.includes(values.gender)) issue('gender', 'Gender is required')
  })

export function toQuickPatientPayload(values) {
  return {
    fullName: values.fullName,
    phone: values.phone,
    age: Number(values.age),
    gender: values.gender,
  }
}
