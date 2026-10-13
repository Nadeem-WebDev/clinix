import { env } from '../config/env.js'

// Keeps a Render free-plan instance from sleeping (it sleeps after 15
// minutes with no incoming traffic, which also stops the reminder sweep)
// by calling its own public keep-alive URL every few minutes. The request
// goes out through the public address, so Render counts it as traffic.
//
// Off unless KEEP_ALIVE_ENABLED=true, and never under NODE_ENV=test. On a
// paid plan it is unnecessary - leave it off there. An outside monitor
// pinging /api/v1/keep-alive does the same job without this.
//
// A free instance kept awake runs all month; Render's free allowance is
// 750 instance-hours a month per workspace, so this fits one service, not
// two.

const REQUEST_TIMEOUT_MS = 10000

let timer = null

// One ping. Resolves true/false and never throws - a missed ping must not
// crash the server, and the next one is only minutes away.
export async function pingOnce(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    if (!response.ok) console.error(`[keep-alive] ping returned HTTP ${response.status}`)
    return response.ok
  } catch (err) {
    console.error(`[keep-alive] ping failed: ${err.message}`)
    return false
  }
}

export function startKeepAliveJob() {
  if (env.nodeEnv === 'test' || !env.keepAlive.enabled) return null
  if (timer) return timer
  if (!env.keepAlive.url) {
    console.error('[keep-alive] KEEP_ALIVE_ENABLED is true but there is no URL to ping (set KEEP_ALIVE_URL)')
    return null
  }

  const intervalMs = env.keepAlive.intervalMinutes * 60 * 1000
  timer = setInterval(() => pingOnce(env.keepAlive.url), intervalMs)
  // Never the reason the process stays up during a shutdown.
  timer.unref()
  // eslint-disable-next-line no-console -- confirms at boot that the self-ping is live
  console.log(`[keep-alive] pinging ${env.keepAlive.url} every ${env.keepAlive.intervalMinutes} min`)
  return timer
}

export function stopKeepAliveJob() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
