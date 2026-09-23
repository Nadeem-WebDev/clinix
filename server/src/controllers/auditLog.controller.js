import { listAuditLogs } from '../services/auditLog.service.js'
import { sendSuccess } from '../utils/ApiResponse.js'

export async function listAuditLogsHandler(req, res, next) {
  try {
    const data = await listAuditLogs(req.clinicId, req.validatedQuery)
    return sendSuccess(res, { data })
  } catch (err) {
    return next(err)
  }
}
