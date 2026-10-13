import { z } from 'zod'

export const platformLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

export const suspendClinicSchema = z.object({
  reason: z.string().trim().min(3, 'Give a short reason').max(300),
})
