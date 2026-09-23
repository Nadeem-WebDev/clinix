import { Router } from 'express'
import {
  createPrescriptionHandler,
  listPrescriptionsHandler,
  getPrescriptionHandler,
  updatePrescriptionHandler,
  finalizePrescriptionHandler,
  getPrescriptionPdfHandler,
} from '../controllers/prescription.controller.js'
import { authenticate } from '../middleware/authenticate.js'
import { authorize } from '../middleware/authorize.js'
import { validateBody, validateQuery } from '../middleware/validate.js'
import {
  createPrescriptionSchema,
  updatePrescriptionSchema,
  listPrescriptionsQuerySchema,
} from '../validators/prescription.validators.js'

const router = Router()

// Same access model as Consultations - owner/admin/doctor only, for the
// same "don't expose medical notes" reasoning (a prescription is arguably
// even more sensitive: actual medications).
router.use(authenticate, authorize('owner', 'admin', 'doctor'))

router.post('/', validateBody(createPrescriptionSchema), createPrescriptionHandler)
router.get('/', validateQuery(listPrescriptionsQuerySchema), listPrescriptionsHandler)
router.get('/:id', getPrescriptionHandler)
router.get('/:id/pdf', getPrescriptionPdfHandler)
router.patch('/:id', validateBody(updatePrescriptionSchema), updatePrescriptionHandler)
router.post('/:id/finalize', finalizePrescriptionHandler)

export default router
