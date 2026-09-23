import { Router } from 'express'
import {
  createPatientHandler,
  listPatientsHandler,
  getPatientHandler,
  updatePatientHandler,
} from '../controllers/patient.controller.js'
import { authenticate } from '../middleware/authenticate.js'
import { authorize } from '../middleware/authorize.js'
import { validateBody, validateQuery } from '../middleware/validate.js'
import {
  createPatientSchema,
  updatePatientSchema,
  listPatientsQuerySchema,
} from '../validators/patient.validators.js'

const router = Router()

router.use(authenticate)

// Registering a new patient is a front-desk action (admin/receptionist).
router.post('/', authorize('owner', 'admin', 'receptionist'), validateBody(createPatientSchema), createPatientHandler)

// Everyone with clinic access can look patients up.
router.get('/', validateQuery(listPatientsQuerySchema), listPatientsHandler)
router.get('/:id', getPatientHandler)

// Admin/receptionist manage the record; nurses can update basic info
// (vitals/consultation-specific fields live on their own models later).
router.patch('/:id', authorize('owner', 'admin', 'receptionist', 'nurse'), validateBody(updatePatientSchema), updatePatientHandler)

export default router
