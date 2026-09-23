import mongoose from 'mongoose'

const patientDocumentSchema = new mongoose.Schema(
  {
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Clinic',
      required: true,
      index: true,
    },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Free text, not a strict enum - the spec's list (blood report, X-ray,
    // MRI report, previous prescription) is given as examples, not an
    // exhaustive set.
    documentType: { type: String, required: true, trim: true },
    originalFilename: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true },
    fileSize: { type: Number, required: true },
    // Never store the raw file in MongoDB - only the Cloudinary reference.
    // resourceType ('image' | 'raw') is needed later to reconstruct a
    // correctly-typed signed delivery URL.
    cloudinaryPublicId: { type: String, required: true },
    cloudinaryResourceType: { type: String, enum: ['image', 'raw'], required: true },
  },
  { timestamps: true },
)

patientDocumentSchema.index({ clinicId: 1, patientId: 1, createdAt: -1 })

export const PatientDocument = mongoose.model('PatientDocument', patientDocumentSchema)
