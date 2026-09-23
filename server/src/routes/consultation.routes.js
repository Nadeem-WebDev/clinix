import { Router } from 'express'
import {
  createConsultationHandler,
  listConsultationsHandler,
  listFollowUpsDueHandler,
  getConsultationHandler,
  updateConsultationHandler,
} from '../controllers/consultation.controller.js'
import { authenticate } from '../middleware/authenticate.js'
import { authorize } from '../middleware/authorize.js'
import { validateBody, validateQuery } from '../middleware/validate.js'
import {
  createConsultationSchema,
  updateConsultationSchema,
  listConsultationsQuerySchema,
} from '../validators/consultation.validators.js'

const router = Router()

// Clinical records - restricted to admin/doctor for both read and write.
// Per the spec: "Do not expose detailed medical notes to receptionists
// unless explicitly permitted by clinic configuration" (no such
// configuration exists yet, so the default stays locked down); nurses'
// spec'd access is limited to vitals/basic info on the Patient record
// itself, not full consultation notes/diagnosis.
router.use(authenticate, authorize('owner', 'admin', 'doctor'))

router.post('/', validateBody(createConsultationSchema), createConsultationHandler)
router.get('/', validateQuery(listConsultationsQuerySchema), listConsultationsHandler)

// Static path - must come before "/:id" or Express would treat "follow-ups"
// as an id (same reasoning as appointments' "/queue" route).
router.get('/follow-ups', listFollowUpsDueHandler)

router.get('/:id', getConsultationHandler)
router.patch('/:id', validateBody(updateConsultationSchema), updateConsultationHandler)

export default router
