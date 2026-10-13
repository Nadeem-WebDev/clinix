import { Router } from 'express'
import {
  loginHandler,
  logoutHandler,
  meHandler,
  overviewHandler,
  listClinicsHandler,
  getClinicHandler,
  suspendClinicHandler,
  unsuspendClinicHandler,
  resetStaffPasswordHandler,
} from '../controllers/platform.controller.js'
import { authenticatePlatform } from '../middleware/authenticatePlatform.js'
import { authRateLimiter } from '../middleware/rateLimiter.js'
import { validateBody } from '../middleware/validate.js'
import { platformLoginSchema, suspendClinicSchema } from '../validators/platform.validators.js'

// Clinix's own admin panel (/platform in the app). Its session is separate
// from every clinic's - see authenticatePlatform and utils/jwt.js.
const router = Router()

router.post('/auth/login', authRateLimiter, validateBody(platformLoginSchema), loginHandler)
router.post('/auth/logout', logoutHandler)

router.use(authenticatePlatform)

router.get('/auth/me', meHandler)
router.get('/overview', overviewHandler)
router.get('/clinics', listClinicsHandler)
router.get('/clinics/:id', getClinicHandler)
router.post('/clinics/:id/suspend', validateBody(suspendClinicSchema), suspendClinicHandler)
router.post('/clinics/:id/unsuspend', unsuspendClinicHandler)
router.post('/clinics/:id/staff/:userId/reset-password', resetStaffPasswordHandler)

export default router
