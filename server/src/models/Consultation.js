import mongoose from 'mongoose'

const vitalsSchema = new mongoose.Schema(
  {
    temperature: { type: String, trim: true }, // e.g. "98.6°F" - free text, units vary by clinic
    bloodPressure: { type: String, trim: true }, // e.g. "120/80"
    pulse: { type: String, trim: true },
    respiratoryRate: { type: String, trim: true },
    spo2: { type: String, trim: true },
    weight: { type: String, trim: true },
    height: { type: String, trim: true },
  },
  { _id: false },
)

const consultationSchema = new mongoose.Schema(
  {
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Clinic',
      required: true,
      index: true,
    },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Optional per the spec ("belongs to ... Appointment when applicable"),
    // but the normal flow always sets this - a doctor starts a
    // consultation from an appointment that's IN_CONSULTATION.
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
    chiefComplaint: { type: String, trim: true },
    vitals: { type: vitalsSchema, default: () => ({}) },
    symptoms: { type: String, trim: true },
    examinationNotes: { type: String, trim: true },
    diagnosis: { type: String, trim: true },
    treatmentPlan: { type: String, trim: true },
    doctorNotes: { type: String, trim: true },
    followUpDate: { type: Date },
    followUpInstructions: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
)

// Every visit is its own record - "do not overwrite old consultations" -
// so there's no per-patient uniqueness constraint here, just lookup indexes.
consultationSchema.index({ clinicId: 1, patientId: 1, createdAt: -1 })
consultationSchema.index({ clinicId: 1, doctorId: 1, createdAt: -1 })
consultationSchema.index({ clinicId: 1, appointmentId: 1 })

export const Consultation = mongoose.model('Consultation', consultationSchema)
