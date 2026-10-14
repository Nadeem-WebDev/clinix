import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { DAYS_OF_WEEK } from './Clinic.js'

export const ROLES = ['owner', 'admin', 'doctor', 'receptionist', 'nurse']

// A doctor's day: off, or one or two sessions ("HH:mm", 24-hour) - many
// OPDs run a morning and an evening session with a break between.
const doctorSessionSchema = new mongoose.Schema(
  {
    start: { type: String, required: true },
    end: { type: String, required: true },
  },
  { _id: false },
)

const doctorDaySchema = new mongoose.Schema(
  {
    day: { type: String, enum: DAYS_OF_WEEK, required: true },
    isAvailable: { type: Boolean, default: true },
    sessions: { type: [doctorSessionSchema], default: [] },
  },
  { _id: false },
)

// Only used for role 'doctor': what a prescription has to say about who
// wrote it. All free text - degree names and councils vary too much to
// enumerate. The signature image lives here (not on Cloudinary) so it is
// never reachable from a public URL; its bytes are select: false so they
// aren't loaded on every request that reads a user.
const doctorProfileSchema = new mongoose.Schema(
  {
    qualifications: { type: String, trim: true, maxlength: 200 }, // "MBBS, MD (General Medicine)"
    specialization: { type: String, trim: true, maxlength: 100 },
    registrationNumber: { type: String, trim: true, maxlength: 50 },
    registrationCouncil: { type: String, trim: true, maxlength: 100 }, // "Maharashtra Medical Council"
    // Prefills the "Consultation Fee" line on this doctor's bills. Unset
    // means the clinic's defaultConsultationFee applies.
    consultationFee: { type: Number, min: 0 },
    // All 7 days when set, like Clinic.workingHours. Unset means no fixed
    // hours: the doctor can be booked at any time (the behaviour before
    // per-doctor hours existed). Bookings outside them need "book anyway".
    workingHours: { type: [doctorDaySchema], default: undefined },
    signature: {
      data: { type: Buffer, select: false },
      contentType: { type: String },
      updatedAt: { type: Date },
    },
  },
  { _id: false },
)

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
    // Bumped on a password change and carried in every login token (`sv`).
    // authenticate() rejects a token with an older number, so a change
    // signs out every other device still holding an old session.
    sessionVersion: { type: Number, default: 0 },
    doctorProfile: { type: doctorProfileSchema, default: undefined },
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
    if (ret.doctorProfile?.signature) delete ret.doctorProfile.signature.data
    return ret
  },
})

export const User = mongoose.model('User', userSchema)
