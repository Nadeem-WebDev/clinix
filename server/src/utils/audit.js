import { AuditLog } from '../models/AuditLog.js'

// Fire-and-forget-but-awaited audit write. Never let a logging failure
// break the actual request - log the failure and move on.
export async function writeAuditLog({
  clinicId,
  userId,
  action,
  resourceType,
  resourceId,
  metadata,
  ipAddress,
}) {
  try {
    await AuditLog.create({
      clinicId,
      userId,
      action,
      resourceType,
      resourceId,
      metadata,
      ipAddress,
    })
  } catch (err) {
    console.error('Failed to write audit log:', err.message)
  }
}
