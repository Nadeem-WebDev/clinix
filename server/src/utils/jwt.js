import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'

export const AUTH_COOKIE_NAME = 'clinic_crm_token'

export function signAuthToken({ userId, clinicId, role, sessionVersion = 0 }) {
  return jwt.sign(
    { sub: String(userId), clinicId: String(clinicId), role, sv: sessionVersion },
    env.jwt.secret,
    { expiresIn: env.jwt.expiresIn },
  )
}

export function verifyAuthToken(token) {
  const payload = jwt.verify(token, env.jwt.secret)
  // A platform admin's token is never a clinic session.
  if (payload.aud === PLATFORM_AUDIENCE) throw new Error('Not a clinic session')
  return payload
}

// --- Platform admin sessions ----------------------------------------------
// A separate cookie, scoped to the platform API path so the browser never
// sends it anywhere else, and a token with its own audience so neither kind
// of token is accepted by the other's middleware.
export const PLATFORM_COOKIE_NAME = 'clinix_platform_token'
const PLATFORM_AUDIENCE = 'platform'
const PLATFORM_COOKIE_PATH = '/api/v1/platform'

export function signPlatformToken({ adminId, sessionVersion = 0 }) {
  return jwt.sign({ sub: String(adminId), sv: sessionVersion }, env.jwt.secret, {
    audience: PLATFORM_AUDIENCE,
    expiresIn: env.jwt.platformExpiresIn,
  })
}

export function verifyPlatformToken(token) {
  return jwt.verify(token, env.jwt.secret, { audience: PLATFORM_AUDIENCE })
}

export function platformCookieOptions() {
  return { ...baseCookieOptions(), path: PLATFORM_COOKIE_PATH, maxAge: 12 * 60 * 60 * 1000 }
}

export function clearPlatformCookieOptions() {
  return { ...baseCookieOptions(), path: PLATFORM_COOKIE_PATH }
}

function baseCookieOptions() {
  return {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    // When this server also serves the frontend (SERVE_CLIENT, the
    // single-service Render deploy), every API call is same-origin and Lax
    // is both sufficient and safer - and it is a first-party cookie, which
    // browsers that block third-party cookies (Safari) still send.
    //
    // In the split deploy (frontend on Vercel, API on Render) every API
    // call is genuinely cross-site, and a Lax cookie is never sent on the
    // XHR/fetch calls auth depends on - so that setup needs SameSite=None
    // (which requires Secure, already true above). Local dev keeps Lax:
    // localhost:5173 -> localhost:5000 is same-site, and Lax works without
    // HTTPS.
    sameSite: env.nodeEnv === 'production' && !env.serveClient ? 'none' : 'lax',
  }
}

export function authCookieOptions() {
  return {
    ...baseCookieOptions(),
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days; keep in sync with JWT_EXPIRES_IN default
  }
}

// res.clearCookie() no longer accepts maxAge (Express deprecation) - it
// must match the same non-expiry attributes the cookie was set with.
export function clearAuthCookieOptions() {
  return baseCookieOptions()
}
