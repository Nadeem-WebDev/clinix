import { AuditLog } from '../models/AuditLog.js'
import { dayRange } from '../utils/dateRange.js'
import { getClinicTimezone } from './clinic.service.js'

// Read-only by design - nothing in the app ever updates or deletes an
// audit log entry (see the AuditLog model comment).
export async function listAuditLogs(clinicId, { userId, action, resourceType, from, to, page, limit }) {
  const filter = { clinicId }
  if (userId) filter.userId = userId
  if (action) filter.action = action
  if (resourceType) filter.resourceType = resourceType
  if (from || to) {
    const tz = await getClinicTimezone(clinicId)
    filter.createdAt = {}
    if (from) filter.createdAt.$gte = dayRange(from, tz).start
    if (to) filter.createdAt.$lte = dayRange(to, tz).end
  }

  const skip = (page - 1) * limit
  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'name email role'),
    AuditLog.countDocuments(filter),
  ])

  return {
    logs,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  }
}
