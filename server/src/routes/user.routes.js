import { Router } from 'express'
import {
  createStaffHandler,
  listStaffHandler,
  setStaffActiveHandler,
} from '../controllers/user.controller.js'
import { authenticate } from '../middleware/authenticate.js'
import { authorize } from '../middleware/authorize.js'
import { validateBody } from '../middleware/validate.js'
import { createStaffSchema } from '../validators/user.validators.js'

const router = Router()

router.use(authenticate)

// Listing staff (e.g. to populate a "doctor" picker when booking an
// appointment) is available to any authenticated clinic member - a
// same-clinic staff directory isn't sensitive. Creating/disabling staff
// stays admin-only. Tenant scoping happens inside the controllers via
// req.clinicId either way.
router.get('/', listStaffHandler)
router.post('/', authorize('owner', 'admin'), validateBody(createStaffSchema), createStaffHandler)
router.patch('/:id/active', authorize('owner', 'admin'), setStaffActiveHandler)

export default router
