import mongoose from 'mongoose'

// Backs atomic per-clinic sequence generation (e.g. human-friendly patient
// IDs). One counter document per (clinicId, name) pair.
const counterSchema = new mongoose.Schema({
  clinicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', required: true },
  name: { type: String, required: true },
  seq: { type: Number, default: 0 },
})

counterSchema.index({ clinicId: 1, name: 1 }, { unique: true })

export const Counter = mongoose.model('Counter', counterSchema)

// Atomic increment-and-get - safe under concurrent requests (findOneAndUpdate
// with $inc is a single atomic Mongo operation, so two simultaneous
// registrations can never receive the same number).
export async function nextSequence(clinicId, name) {
  const counter = await Counter.findOneAndUpdate(
    { clinicId, name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  )
  return counter.seq
}
