import { Router } from 'express'
import {
  getPatientReportHandler,
  getAppointmentReportHandler,
  getRevenueReportHandler,
} from '../controllers/report.controller.js'
import { authenticate } from '../middleware/authenticate.js'
import { authorize } from '../middleware/authorize.js'
import { validateQuery } from '../middleware/validate.js'
import {
  dateRangeQuerySchema,
  appointmentReportQuerySchema,
  revenueReportQuerySchema,
} from '../validators/report.validators.js'

const router = Router()

// Reports are owner/admin-only per the spec ("Admin can view: ...").
router.use(authenticate, authorize('owner', 'admin'))

router.get('/patients', validateQuery(dateRangeQuerySchema), getPatientReportHandler)
router.get('/appointments', validateQuery(appointmentReportQuerySchema), getAppointmentReportHandler)
router.get('/revenue', validateQuery(revenueReportQuerySchema), getRevenueReportHandler)

export default router
