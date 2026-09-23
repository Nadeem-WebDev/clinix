import mongoose from 'mongoose'

// Append-only. Nothing in the app should ever update or delete an
// AuditLog document - services only ever create() one.
const auditLogSchema = new mongoose.Schema(
  {
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Clinic',
      required: true,
      index: true,
    },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true },
    resourceType: { type: String, required: true },
    resourceId: { type: mongoose.Schema.Types.ObjectId },
    // Keep metadata to non-sensitive bookkeeping (e.g. { email } on login) -
    // never clinical notes/diagnoses/etc.
    metadata: { type: mongoose.Schema.Types.Mixed },
    ipAddress: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

auditLogSchema.index({ clinicId: 1, createdAt: -1 })

export const AuditLog = mongoose.model('AuditLog', auditLogSchema)
