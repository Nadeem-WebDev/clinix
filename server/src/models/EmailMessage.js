import mongoose from 'mongoose'

// Delivery log for outbound notification emails - the email twin of
// WhatsappMessage, for the same reason: a row on EVERY send attempt,
// including the ones never sent (kill switch off, clinic toggle off,
// patient unsubscribed, no email address on file), so "why didn't this
// patient get an email?" always has an answer.
export const EMAIL_MESSAGE_STATUSES = [
  // Deliberately not handed to Brevo - see errorMessage for why.
  'QUEUED',
  'SENT',
  'FAILED',
]

const emailMessageSchema = new mongoose.Schema(
  {
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Clinic',
      required: true,
      index: true,
    },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    // Exactly what was handed to Brevo (or would have been), kept verbatim
    // so the log still explains a misdelivery after the address is fixed.
    toEmail: { type: String },
    // Which notification: APPOINTMENT_CONFIRMATION, APPOINTMENT_REMINDER,
    // QUEUE_UPDATE or DOCUMENT_READY.
    kind: { type: String, required: true },
    subject: { type: String },
    relatedResourceType: { type: String }, // 'Appointment' | 'Prescription' | 'Invoice'
    relatedResourceId: { type: mongoose.Schema.Types.ObjectId },
    status: { type: String, enum: EMAIL_MESSAGE_STATUSES, default: 'QUEUED' },
    // Brevo's messageId, for looking a send up in Brevo's own logs.
    providerMessageId: { type: String },
    // Why a send failed, or why it was never attempted.
    errorMessage: { type: String },
    sentAt: { type: Date },
  },
  { timestamps: true },
)

emailMessageSchema.index({ clinicId: 1, patientId: 1, createdAt: -1 })

export const EmailMessage = mongoose.model('EmailMessage', emailMessageSchema)
