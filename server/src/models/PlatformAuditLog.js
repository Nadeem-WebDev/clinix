import mongoose from 'mongoose'

// Append-only record of what platform admins did (suspend a clinic, reset a
// staff password, ...). Kept apart from the clinic AuditLog, whose userId
// always means a clinic staff member.
const platformAuditLogSchema = new mongoose.Schema(
  {
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'PlatformAdmin', required: true },
    action: { type: String, required: true },
    clinicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', index: true },
    targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    metadata: { type: mongoose.Schema.Types.Mixed },
    ipAddress: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

platformAuditLogSchema.index({ createdAt: -1 })

export const PlatformAuditLog = mongoose.model('PlatformAuditLog', platformAuditLogSchema)
