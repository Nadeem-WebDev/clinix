import { Router } from 'express'
import { listAuditLogsHandler } from '../controllers/auditLog.controller.js'
import { authenticate } from '../middleware/authenticate.js'
import { authorize } from '../middleware/authorize.js'
import { validateQuery } from '../middleware/validate.js'
import { listAuditLogsQuerySchema } from '../validators/auditLog.validators.js'

const router = Router()

// Owner/admin-only, per the spec ("Admin can: ... View audit logs").
router.get('/', authenticate, authorize('owner', 'admin'), validateQuery(listAuditLogsQuerySchema), listAuditLogsHandler)

export default router
