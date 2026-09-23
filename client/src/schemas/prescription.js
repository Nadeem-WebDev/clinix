import { z } from 'zod'

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

export const prescriptionFormSchema = z.object({
  medicines: z.array(medicineSchema).min(1, 'Add at least one medicine'),
  notes: z.string().trim().optional(),
})

export const emptyMedicine = {
  name: '',
  dosage: '',
  frequency: '',
  route: '',
  timing: '',
  duration: '',
  instructions: '',
  quantity: '',
}
