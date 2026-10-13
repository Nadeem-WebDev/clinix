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

// Like nextSequence, but never returns a number at or below `floor` - for a
// counter that must carry on after values already issued another way. Still
// one atomic operation: the counter moves to max(current, floor) + 1 in a
// single update, so concurrent callers can't receive the same number.
// clinicId/name are deliberately not $set: on upsert Mongo copies them from
// the (Mongoose-cast) filter, whereas values inside an update pipeline are
// not cast and a string id would never match again.
export async function nextSequenceAbove(clinicId, name, floor) {
  const counter = await Counter.findOneAndUpdate(
    { clinicId, name },
    [{ $set: { seq: { $add: [{ $max: [{ $ifNull: ['$seq', 0] }, floor] }, 1] } } }],
    { new: true, upsert: true },
  )
  return counter.seq
}
