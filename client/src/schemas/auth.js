import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

export const registerClinicSchema = z.object({
  clinicName: z.string().trim().min(2, 'Clinic name is required'),
  adminName: z.string().trim().min(2, 'Your name is required'),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})
