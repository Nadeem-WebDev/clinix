import { Router } from 'express'
import {
  registerClinicHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  changePasswordHandler,
} from '../controllers/auth.controller.js'
import { validateBody } from '../middleware/validate.js'
import { registerClinicSchema, loginSchema, changePasswordSchema } from '../validators/auth.validators.js'
import { authenticate } from '../middleware/authenticate.js'
import { authRateLimiter } from '../middleware/rateLimiter.js'

const router = Router()

router.post('/register-clinic', authRateLimiter, validateBody(registerClinicSchema), registerClinicHandler)
router.post('/login', authRateLimiter, validateBody(loginSchema), loginHandler)
router.post('/logout', authenticate, logoutHandler)
router.get('/me', authenticate, meHandler)
// Rate-limited like login: it is a password check an attacker with a
// stolen session could otherwise brute-force.
router.post(
  '/change-password',
  authenticate,
  authRateLimiter,
  validateBody(changePasswordSchema),
  changePasswordHandler,
)

export default router
