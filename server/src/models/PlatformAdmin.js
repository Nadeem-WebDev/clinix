import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

// The people who run Clinix itself (not any clinic's staff). Deliberately a
// separate collection from User: a platform admin belongs to no clinic, and
// nothing that queries clinic staff can ever return one. There is no signup
// route - accounts are made with `npm run create-platform-admin`.
const platformAdminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true, select: false },
    active: { type: Boolean, default: true },
    // Same idea as User.sessionVersion: bumping it signs out every session.
    sessionVersion: { type: Number, default: 0 },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
)

platformAdminSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.passwordHash)
}

platformAdminSchema.statics.hashPassword = function hashPassword(plain) {
  return bcrypt.hash(plain, 12)
}

platformAdminSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash
    return ret
  },
})

export const PlatformAdmin = mongoose.model('PlatformAdmin', platformAdminSchema)
