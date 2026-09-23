import mongoose from 'mongoose'
import { SLUG_PATTERN } from '../utils/slug.js'

export const DAYS_OF_WEEK = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]

// One entry per day of the week, always all 7 (never sparse) so the
// Settings UI can render a fixed-size table without guessing which days
// are missing.
const workingDaySchema = new mongoose.Schema(
  {
    day: { type: String, enum: DAYS_OF_WEEK, required: true },
    isOpen: { type: Boolean, default: true },
    openTime: { type: String, default: '09:00' }, // "HH:mm", 24-hour
    closeTime: { type: String, default: '18:00' },
  },
  { _id: false },
)

function defaultWorkingHours() {
  return DAYS_OF_WEEK.map((day) => ({
    day,
    isOpen: day !== 'sunday',
    openTime: '09:00',
    closeTime: '18:00',
  }))
}

const clinicSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Public, no-login URL identifier for the waiting-room queue page
    // (/q/:slug). Generated from `name` at registration time - never
    // supplied by the frontend, so a clinic can't squat on someone else's
    // slug. Unique across the whole platform, not per-tenant: it IS the
    // tenant lookup key on the public route, where there's no session to
    // scope by.
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [SLUG_PATTERN, 'Slug must be lowercase letters, numbers and single hyphens'],
    },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    // Used as the fallback appointment length when one isn't specified
    // per-booking.
    defaultAppointmentDurationMinutes: { type: Number, default: 15, min: 5 },
    // Editable via Clinic Settings; not yet read anywhere else (unlike
    // defaultAppointmentDurationMinutes above, nothing prefills a new
    // consultation/invoice's fee from this yet - that wiring is still to
    // be built).
    defaultConsultationFee: { type: Number, default: 0, min: 0 },
    workingHours: { type: [workingDaySchema], default: defaultWorkingHours },
    // Per-clinic WhatsApp toggle, flipped by the Owner in Clinic Settings.
    // Independent of, and subordinate to, the platform-wide
    // WHATSAPP_ENABLED kill switch - both must be on for a message to be
    // sent. Off by default so enabling WhatsApp platform-wide never
    // silently starts messaging every existing clinic's patients.
    whatsappEnabled: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
)

export const Clinic = mongoose.model('Clinic', clinicSchema)
