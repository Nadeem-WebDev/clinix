import mongoose from 'mongoose'

// BOOKED -> WAITING (front desk marks arrival - "ARRIVED" exists as a
// value for API/data completeness, but the app collapses arrival straight
// into WAITING since that's how section 46's workflow describes it: the
// receptionist marks arrival and the patient is immediately in the
// waiting queue, not a separate resting state) -> IN_CONSULTATION (doctor
// calls them in) -> COMPLETED. CANCELLED/NO_SHOW are terminal, reachable
// from any non-terminal state.
export const APPOINTMENT_STATUSES = [
  'BOOKED',
  'ARRIVED',
  'WAITING',
  'IN_CONSULTATION',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
]

const appointmentSchema = new mongoose.Schema(
  {
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Clinic',
      required: true,
      index: true,
    },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    scheduledAt: { type: Date, required: true },
    durationMinutes: { type: Number, required: true, min: 5 },
    status: { type: String, enum: APPOINTMENT_STATUSES, default: 'BOOKED' },
    // Per-doctor, per-day sequential number (e.g. token 1, 2, 3…) - shown
    // on the queue screen and assigned automatically at booking time.
    tokenNumber: { type: Number, required: true },
    isWalkIn: { type: Boolean, default: false },
    notes: { type: String, trim: true },
    // Deprioritized in "next patient" order but still directly callable -
    // see Module 6 "skip patient if necessary".
    skipped: { type: Boolean, default: false },
    arrivedAt: { type: Date },
    consultationStartedAt: { type: Date },
    completedAt: { type: Date },
    cancelledAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
)

appointmentSchema.index({ clinicId: 1, scheduledAt: 1 })
appointmentSchema.index({ clinicId: 1, doctorId: 1, scheduledAt: 1 })
appointmentSchema.index({ clinicId: 1, status: 1 })
appointmentSchema.index({ clinicId: 1, patientId: 1 })

export const Appointment = mongoose.model('Appointment', appointmentSchema)
