import { z } from 'zod'

export const appointmentFormSchema = z.object({
  patientId: z.string().min(1, 'Select a patient'),
  doctorId: z.string().min(1, 'Select a doctor'),
  date: z.string().min(1, 'Date is required'),
  time: z.string().min(1, 'Time is required'),
  durationMinutes: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  isWalkIn: z.boolean().optional(),
})

export function toAppointmentPayload(values) {
  return {
    patientId: values.patientId,
    doctorId: values.doctorId,
    scheduledAt: new Date(`${values.date}T${values.time}:00`).toISOString(),
    ...(values.durationMinutes ? { durationMinutes: Number(values.durationMinutes) } : {}),
    ...(values.notes ? { notes: values.notes } : {}),
    ...(values.isWalkIn ? { isWalkIn: true } : {}),
  }
}

export function todayDateStr() {
  return new Date().toISOString().slice(0, 10)
}

export function nowTimeStr() {
  return new Date().toTimeString().slice(0, 5)
}
