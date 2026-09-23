import { env } from '../config/env.js'
import * as webhookService from '../services/whatsappWebhook.service.js'

// Meta's one-time subscription handshake: it GETs the callback URL with a
// token we configured on their side and expects the challenge echoed back
// verbatim as plain text - not JSON, and not wrapped in the app's usual
// success envelope.
export function verifyWebhookHandler(req, res) {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']

  if (mode === 'subscribe' && token && token === env.whatsapp.webhookVerifyToken) {
    return res.status(200).type('text/plain').send(String(challenge ?? ''))
  }

  // No detail in the response: this endpoint is public, and a precise
  // error would help someone guess the verify token.
  return res.sendStatus(403)
}

export async function receiveWebhookHandler(req, res) {
  const { ok, reason } = webhookService.verifySignature(
    req.rawBody,
    req.get('X-Hub-Signature-256'),
  )

  if (!ok) {
    console.warn(`[whatsapp] rejected webhook: ${reason}`)
    return res.sendStatus(403)
  }
  if (reason) {
    console.warn(`[whatsapp] ${reason}`)
  }

  try {
    await webhookService.processWebhookPayload(req.body)
  } catch (err) {
    // Still 200 below: Meta retries anything non-2xx, and replaying a
    // payload we already partly applied is worse than dropping it. The
    // error is in the logs either way.
    console.error('[whatsapp] webhook processing failed:', err.message)
  }

  // Always acknowledge promptly - Meta disables a webhook that repeatedly
  // fails to respond.
  return res.sendStatus(200)
}
