import mongoose from 'mongoose'

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown']
export const GENDERS = ['male', 'female', 'other']
// Languages a WhatsApp template can be sent in. Adding one here is not
// enough on its own - the matching template must also be approved in Meta
// Business Manager in that language, or the send is rejected.
export const PATIENT_LANGUAGES = ['en', 'hi', 'mr']

const patientSchema = new mongoose.Schema(
  {
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Clinic',
      required: true,
      index: true,
    },
    // Human-friendly, clinic-scoped identifier (e.g. "P-10001") - shown to
    // staff and printed on documents. Never used as the DB key (that's
    // Mongo's own _id) and never derived from any PII.
    patientId: { type: String, required: true },
    fullName: { type: String, required: true, trim: true },
    dob: { type: Date },
    // Fallback for when DOB is unknown - at least one of dob/age is
    // required (enforced in the validator, not here, since MongoDB schema
    // validation can't easily express "at least one of").
    age: { type: Number, min: 0, max: 150 },
    gender: { type: String, enum: GENDERS, required: true },
    phone: { type: String, required: true, trim: true, index: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
    emergencyContact: {
      name: { type: String, trim: true },
      phone: { type: String, trim: true },
    },
    bloodGroup: { type: String, enum: BLOOD_GROUPS, default: 'unknown' },
    allergies: { type: [String], default: [] },
    medicalConditions: { type: [String], default: [] },
    medicalHistory: { type: String, trim: true },
    notes: { type: String, trim: true },
    // WhatsApp consent. Defaults to true because the clinic collects this
    // number from the patient at registration for care coordination - but
    // an opt-out path is mandatory, not optional: replying STOP on
    // WhatsApp flips this to false via the webhook, and nothing re-enables
    // it automatically.
    whatsappOptIn: { type: Boolean, default: true },
    whatsappOptOutAt: { type: Date },
    // Drives the language variant of the approved Meta template used for
    // this patient. Only languages actually approved in Meta Business
    // Manager will deliver - see README.
    preferredLanguage: { type: String, enum: PATIENT_LANGUAGES, default: 'en' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
)

patientSchema.index({ clinicId: 1, patientId: 1 }, { unique: true })
patientSchema.index({ clinicId: 1, phone: 1 })
patientSchema.index({ clinicId: 1, createdAt: -1 })
patientSchema.index({ clinicId: 1, fullName: 1 })

export const Patient = mongoose.model('Patient', patientSchema)
