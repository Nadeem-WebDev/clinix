import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'

export const AUTH_COOKIE_NAME = 'clinic_crm_token'

export function signAuthToken({ userId, clinicId, role }) {
  return jwt.sign({ sub: String(userId), clinicId: String(clinicId), role }, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn,
  })
}

export function verifyAuthToken(token) {
  return jwt.verify(token, env.jwt.secret)
}

function baseCookieOptions() {
  return {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    // In production, the frontend (Vercel) and backend (Render) live on
    // different domains - every API call is genuinely cross-site, and a
    // SameSite=Lax cookie is only ever sent on a top-level navigation,
    // never on the XHR/fetch calls this app's auth depends on. SameSite=
    // None (which requires Secure, already true above) is what actually
    // gets sent cross-site. Local dev keeps Lax: localhost:5173 ->
    // localhost:5000 is same-site (same registrable domain, just a
    // different port), and Lax also works without HTTPS.
    sameSite: env.nodeEnv === 'production' ? 'none' : 'lax',
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
