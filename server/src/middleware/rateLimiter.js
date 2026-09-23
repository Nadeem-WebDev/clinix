import rateLimit from 'express-rate-limit'
import { env } from '../config/env.js'

// Applies to login/register endpoints specifically (not the whole API) -
// slows down credential-stuffing / brute-force attempts. Skipped in the
// test environment: this is a production safety net, not something the
// test suite is meant to be exercising, and its shared in-memory store
// otherwise trips across the many register/login calls a single test
// file's fixtures make.
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.nodeEnv === 'test',
  message: {
    success: false,
    message: 'Too many attempts, please try again later.',
    code: 'RATE_LIMITED',
  },
})

// The public queue page polls every 10-15s per open tab, and a waiting
// room can legitimately have a TV plus a dozen patients' phones behind one
// NAT'd IP. 120/min is therefore generous by design - it exists to stop
// someone enumerating slugs or hammering the endpoint, not to police
// normal polling. Skipped in test for the same reason as authRateLimiter:
// the store is shared in-memory across a file's requests.
export const publicQueueRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.nodeEnv === 'test',
  message: {
    success: false,
    message: 'Too many requests, please slow down.',
    code: 'RATE_LIMITED',
  },
})

// Meta retries webhook deliveries and can batch several status updates per
// POST, so this is sized to absorb a burst rather than to throttle. It is
// mostly a backstop against an unauthenticated endpoint being used as a
// free write path if signature verification is ever misconfigured.
export const whatsappWebhookRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.nodeEnv === 'test',
  message: {
    success: false,
    message: 'Too many requests.',
    code: 'RATE_LIMITED',
  },
})
