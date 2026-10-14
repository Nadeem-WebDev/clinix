import mongoose from 'mongoose'
import { SLUG_PATTERN } from '../utils/slug.js'
import { DEFAULT_TIMEZONE, isValidTimeZone } from '../utils/dateRange.js'

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
    // Prefills the "Consultation Fee" line on a new bill, unless the bill's
    // doctor has their own fee (User.doctorProfile.consultationFee).
    defaultConsultationFee: { type: Number, default: 0, min: 0 },
    workingHours: { type: [workingDaySchema], default: defaultWorkingHours },
    // Per-clinic WhatsApp toggle, flipped by the Owner in Clinic Settings.
    // Independent of, and subordinate to, the platform-wide
    // WHATSAPP_ENABLED kill switch - both must be on for a message to be
    // sent. Off by default so enabling WhatsApp platform-wide never
    // silently starts messaging every existing clinic's patients.
    whatsappEnabled: { type: Boolean, default: false },
    // The same per-clinic toggle for email notifications, subordinate to
    // the platform-wide EMAIL_ENABLED switch. Off by default for the same
    // reason.
    emailEnabled: { type: Boolean, default: false },
    // IANA time zone (e.g. 'Asia/Kolkata') that defines the clinic's day:
    // "today" on the queue/dashboard, per-day token numbers, report days,
    // follow-up status, and the times in WhatsApp messages. Existing clinics
    // get the default on read, so no backfill is needed.
    timezone: {
      type: String,
      default: DEFAULT_TIMEZONE,
      validate: { validator: isValidTimeZone, message: 'Not a valid time zone' },
    },
    // Clinic logo, shown in the app shell and on the public queue page.
    // A public Cloudinary asset (unlike patient documents, which are
    // authenticated-only): a logo is meant to be seen, including by
    // patients who never sign in. Only ever set by the logo upload route -
    // updateClinicSettingsSchema has no logo fields, so a settings PATCH
    // cannot point it at an arbitrary URL.
    logoUrl: { type: String, trim: true },
    logoPublicId: { type: String, trim: true },
    // false = suspended by a platform admin: staff can't log in (and existing
    // sessions stop working), the public queue page 404s, and reminders skip it.
    active: { type: Boolean, default: true },
    suspendedAt: { type: Date },
    suspendedReason: { type: String, trim: true },
  },
  { timestamps: true },
)

export const Clinic = mongoose.model('Clinic', clinicSchema)

export const CLINIC_SUSPENDED_MESSAGE = "This clinic's account is suspended. Please contact Clinix support."
