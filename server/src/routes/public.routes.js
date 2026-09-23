import { Router } from 'express'
import { getPublicQueueHandler } from '../controllers/public.controller.js'
import { validateParams, validateQuery } from '../middleware/validate.js'
import { publicQueueRateLimiter } from '../middleware/rateLimiter.js'
import {
  publicQueueParamsSchema,
  publicQueueQuerySchema,
} from '../validators/public.validators.js'

// UNAUTHENTICATED ROUTES.
//
// Every other router in this app starts with `router.use(authenticate)`.
// This one intentionally does not - it backs the no-login waiting-room
// queue page (/q/:slug), which a patient opens from a WhatsApp link or a
// QR code on the wall with no account at all.
//
// The compensating controls, since there is no session to lean on:
//   - rate limiting on every route here (publicQueueRateLimiter)
//   - the tenant comes from a validated :slug, never from request input
//   - responses are built from a strict field allow-list in
//     publicQueue.service.js, never from raw documents
//
// Anything added to this file inherits those obligations. If a new route
// needs patient-identifying or clinical data, it does not belong here.
const router = Router()

router.get(
  '/clinics/:slug/queue',
  publicQueueRateLimiter,
  validateParams(publicQueueParamsSchema),
  validateQuery(publicQueueQuerySchema),
  getPublicQueueHandler,
)

export default router
