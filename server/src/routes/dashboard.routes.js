import { Router } from 'express'
import { getDashboardHandler } from '../controllers/dashboard.controller.js'
import { authenticate } from '../middleware/authenticate.js'

const router = Router()

// Every role gets a dashboard - the service branches on req.user.role and
// only ever returns fields appropriate to that role (e.g. revenue is
// admin-only, never computed at all for other roles).
router.get('/', authenticate, getDashboardHandler)

export default router
