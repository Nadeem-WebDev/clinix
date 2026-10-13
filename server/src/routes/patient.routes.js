import { Router } from 'express'
import {
  createPatientHandler,
  listPatientsHandler,
  getPatientHandler,
  updatePatientHandler,
  listPatientVisitsHandler,
  listPatientFollowUpsHandler,
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

// Profile history tabs. Visits: every role, with clinical and billing details
// left out for roles that can't see them. Follow-ups: the front desk books
// them, so receptionists get the dates (without the doctor's instructions);
// nurses don't get this one, matching their lack of consultation access.
router.get('/:id/visits', listPatientVisitsHandler)
router.get('/:id/follow-ups', authorize('owner', 'admin', 'doctor', 'receptionist'), listPatientFollowUpsHandler)

// Admin/receptionist manage the record; nurses can update basic info
// (vitals/consultation-specific fields live on their own models later).
router.patch('/:id', authorize('owner', 'admin', 'receptionist', 'nurse'), validateBody(updatePatientSchema), updatePatientHandler)

export default router
