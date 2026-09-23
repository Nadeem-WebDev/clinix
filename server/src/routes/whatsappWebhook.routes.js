import { Router } from 'express'
import {
  verifyWebhookHandler,
  receiveWebhookHandler,
} from '../controllers/whatsappWebhook.controller.js'
import { whatsappWebhookRateLimiter } from '../middleware/rateLimiter.js'

// UNAUTHENTICATED ROUTES - the second and last exception in this codebase
// (see public.routes.js for the first).
//
// These are called by Meta, not by a browser, so there is no session to
// authenticate. The compensating controls:
//   - X-Hub-Signature-256 is verified against WHATSAPP_APP_SECRET before
//     the payload is trusted (whatsappWebhook.service.js), and an
//     unconfigured secret is refused outright in production
//   - the GET handshake compares against WHATSAPP_WEBHOOK_VERIFY_TOKEN
//   - rate limiting on both verbs
//
// The only writes reachable from here are delivery-status updates on our
// own WhatsappMessage rows and setting whatsappOptIn to false. Nothing
// here may ever grow a path that reads or returns patient data.
const router = Router()

router.get('/webhook', whatsappWebhookRateLimiter, verifyWebhookHandler)
router.post('/webhook', whatsappWebhookRateLimiter, receiveWebhookHandler)

export default router
