import { z } from 'zod'

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id')

export const uploadDocumentSchema = z.object({
  patientId: objectId,
  documentType: z.string().trim().min(1, 'Document type is required'),
})

export const listDocumentsQuerySchema = z.object({
  patientId: objectId.optional(),
})
