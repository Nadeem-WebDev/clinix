import mongoose from 'mongoose'

const medicineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    dosage: { type: String, trim: true }, // e.g. "500mg"
    frequency: { type: String, trim: true }, // e.g. "1 - 0 - 1"
    route: { type: String, trim: true }, // e.g. "Oral"
    timing: { type: String, trim: true }, // e.g. "After food"
    duration: { type: String, trim: true }, // e.g. "3 days"
    instructions: { type: String, trim: true },
    quantity: { type: String, trim: true },
  },
  { _id: false },
)

const prescriptionSchema = new mongoose.Schema(
  {
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Clinic',
      required: true,
      index: true,
    },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    consultationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Consultation',
      required: true,
    },
    medicines: { type: [medicineSchema], default: [] },
    notes: { type: String, trim: true },
    // "Allow editing before finalization. Once finalized, preserve the
    // historical prescription" - unlike Consultation (which derives its
    // lock from the parent appointment's status), Prescription finalizing
    // is its own explicit doctor action.
    finalized: { type: Boolean, default: false },
    finalizedAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
)

prescriptionSchema.index({ clinicId: 1, patientId: 1, createdAt: -1 })
prescriptionSchema.index({ clinicId: 1, consultationId: 1 })

export const Prescription = mongoose.model('Prescription', prescriptionSchema)
