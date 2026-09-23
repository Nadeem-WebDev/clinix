import { Router } from 'express'
import {
  registerClinicHandler,
  loginHandler,
  logoutHandler,
  meHandler,
} from '../controllers/auth.controller.js'
import { validateBody } from '../middleware/validate.js'
import { registerClinicSchema, loginSchema } from '../validators/auth.validators.js'
import { authenticate } from '../middleware/authenticate.js'
import { authRateLimiter } from '../middleware/rateLimiter.js'

const router = Router()

router.post('/register-clinic', authRateLimiter, validateBody(registerClinicSchema), registerClinicHandler)
router.post('/login', authRateLimiter, validateBody(loginSchema), loginHandler)
router.post('/logout', authenticate, logoutHandler)
router.get('/me', authenticate, meHandler)

export default router
