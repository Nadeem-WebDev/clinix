import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

export const ROLES = ['owner', 'admin', 'doctor', 'receptionist', 'nurse']

const userSchema = new mongoose.Schema(
  {
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Clinic',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    // Globally unique (not just per-clinic): login is by email+password alone,
    // with no clinic selector, so one email maps to exactly one account/clinic
    // for this MVP. A person working at multiple clinics would need a
    // separate account per clinic for now - documented as a known limitation.
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true },
    // Soft-disable rather than delete, per the "prefer soft deletion for
    // important records" rule - a disabled user can no longer log in but
    // their history (consultations, prescriptions, etc.) stays intact.
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
)

userSchema.index({ clinicId: 1, role: 1 })

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.passwordHash)
}

userSchema.statics.hashPassword = function hashPassword(plain) {
  return bcrypt.hash(plain, 12)
}

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash
    return ret
  },
})

export const User = mongoose.model('User', userSchema)
