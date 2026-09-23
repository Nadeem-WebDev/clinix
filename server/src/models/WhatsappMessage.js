import mongoose from 'mongoose'

// Delivery log for outbound WhatsApp template messages.
//
// Deliberately separate from the generic AuditLog: that model records "a
// user did a thing" and has no room for a provider message id, a delivery
// state that changes after the fact, or a failure reason. This one is
// written by the system rather than by a user, and is mutated later by
// Meta's delivery webhooks.
//
// A row is written on EVERY send attempt, including the ones that never
// leave the building (kill switch off, clinic toggle off, patient opted
// out). "We deliberately didn't message this patient" is exactly as
// important to be able to prove as "we did".
export const WHATSAPP_MESSAGE_STATUSES = [
  // Accepted by us but not handed to Meta - sending is disabled, or the
  // patient has opted out. Terminal in practice: nothing retries these.
  'QUEUED',
  'SENT',
  'DELIVERED',
  'READ',
  'FAILED',
]

const whatsappMessageSchema = new mongoose.Schema(
  {
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Clinic',
      required: true,
      index: true,
    },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    // E.164, exactly what was handed to Meta - kept verbatim rather than
    // re-derived from the patient, so the log still explains a
    // misdelivery after someone corrects the patient's phone number.
    toPhone: { type: String, required: true },
    templateName: { type: String, required: true },
    languageCode: { type: String, default: 'en' },
    relatedResourceType: { type: String }, // 'Appointment' | 'Prescription' | 'Invoice'
    relatedResourceId: { type: mongoose.Schema.Types.ObjectId },
    status: { type: String, enum: WHATSAPP_MESSAGE_STATUSES, default: 'QUEUED' },
    // Meta's wamid. The correlation key for delivery webhooks, which is
    // why it carries its own index despite being sparse (never set on
    // messages that were never sent).
    providerMessageId: { type: String },
    // Why a send failed, or why it was never attempted.
    errorMessage: { type: String },
    sentAt: { type: Date },
  },
  { timestamps: true },
)

whatsappMessageSchema.index({ clinicId: 1, patientId: 1, createdAt: -1 })
whatsappMessageSchema.index({ providerMessageId: 1 })

export const WhatsappMessage = mongoose.model('WhatsappMessage', whatsappMessageSchema)
