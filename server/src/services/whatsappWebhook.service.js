import crypto from 'node:crypto'
import { env, isProduction } from '../config/env.js'
import { Patient } from '../models/Patient.js'
import { WhatsappMessage } from '../models/WhatsappMessage.js'
import { digitsOnly, phoneMatches } from '../utils/phone.js'

// Inbound side of the WhatsApp integration: Meta's delivery receipts, and
// patients replying STOP.
//
// Everything here runs on an unauthenticated route, so the payload is
// untrusted input until verifySignature() says otherwise.

// Meta reports these; they map 1:1 onto WhatsappMessage.status.
const STATUS_MAP = {
  sent: 'SENT',
  delivered: 'DELIVERED',
  read: 'READ',
  failed: 'FAILED',
}

// Opt-out keywords. English plus Hindi/Marathi equivalents, both in script
// and in the romanized form people actually type on a phone keyboard.
// Compared case-insensitively against the whole trimmed message, not as a
// substring - "please don't stop the reminders" must not opt someone out.
const STOP_KEYWORDS = new Set([
  'stop',
  'unsubscribe',
  'optout',
  'opt out',
  'cancel',
  'band',
  'band karo',
  'bandh',
  'रोको',
  'बंद',
  'बंद करो',
  'थांबा',
  'थांबवा',
])

export function isStopKeyword(text) {
  return STOP_KEYWORDS.has(String(text ?? '').trim().toLowerCase())
}

/**
 * Verifies Meta's X-Hub-Signature-256 header against the raw request body.
 *
 * Returns { ok, reason }. When WHATSAPP_APP_SECRET isn't configured the
 * payload cannot be verified at all: that's tolerated outside production
 * (so the webhook can be exercised locally) and refused in production,
 * because an unverified webhook is an open write path into patient
 * records.
 */
export function verifySignature(rawBody, signatureHeader) {
  if (!env.whatsapp.appSecret) {
    if (isProduction) return { ok: false, reason: 'WHATSAPP_APP_SECRET is not configured' }
    return { ok: true, reason: 'signature not verified (no app secret configured, non-production)' }
  }
  if (!rawBody || !signatureHeader) return { ok: false, reason: 'missing signature or body' }

  const expected = `sha256=${crypto
    .createHmac('sha256', env.whatsapp.appSecret)
    .update(rawBody)
    .digest('hex')}`

  const a = Buffer.from(expected)
  const b = Buffer.from(String(signatureHeader))
  // timingSafeEqual throws on a length mismatch, so guard first - and
  // compare rather than short-circuit, to keep it constant-time.
  if (a.length !== b.length) return { ok: false, reason: 'signature mismatch' }
  return crypto.timingSafeEqual(a, b)
    ? { ok: true }
    : { ok: false, reason: 'signature mismatch' }
}

// Meta batches everything into entry[].changes[].value. Both `statuses`
// and `messages` are optional, and a single POST can carry several of each.
function extractChangeValues(payload) {
  const entries = Array.isArray(payload?.entry) ? payload.entry : []
  return entries.flatMap((entry) =>
    (Array.isArray(entry?.changes) ? entry.changes : []).map((change) => change?.value).filter(Boolean),
  )
}

async function applyStatusUpdate(status) {
  const mapped = STATUS_MAP[status?.status]
  const providerMessageId = status?.id
  if (!mapped || !providerMessageId) return false

  const update = { status: mapped }
  if (status?.errors?.[0]) {
    update.errorMessage = String(status.errors[0].title ?? status.errors[0].message ?? '').slice(0, 500)
  }

  const result = await WhatsappMessage.updateOne({ providerMessageId }, { $set: update })
  return result.matchedCount > 0
}

/**
 * Finds patients by an inbound E.164 number.
 *
 * Patient.phone is free-form (the clinic types what the patient gives
 * them), so an exact match on the E.164 form usually misses. Candidates
 * cover the common stored shapes, and the regex tolerates separators
 * between digits; the JS pass is the authority. Deliberately not indexed-
 * fast - this runs on an inbound reply, which is rare.
 */
export async function findPatientsByPhone(incomingPhone) {
  const digits = digitsOnly(incomingPhone)
  const tail = digits.slice(-10)
  if (tail.length < 10) return []

  const separatorTolerant = new RegExp(`${tail.split('').join('[^0-9]*')}$`)
  const candidates = await Patient.find({
    $or: [{ phone: { $in: [digits, tail, `+${digits}`, `0${tail}`] } }, { phone: separatorTolerant }],
  })

  return candidates.filter((patient) => phoneMatches(patient.phone, incomingPhone))
}

async function applyInboundMessage(message) {
  if (message?.type !== 'text') return false
  if (!isStopKeyword(message?.text?.body)) return false

  const patients = await findPatientsByPhone(message.from)
  if (patients.length === 0) return false

  // Opting out is global to the number, not per clinic: the person told us
  // to stop, and they have no way to know they exist as several Patient
  // records. Nothing re-enables this automatically - a patient who wants
  // messages again has to be re-opted-in by the clinic.
  await Patient.updateMany(
    { _id: { $in: patients.map((p) => p._id) } },
    { $set: { whatsappOptIn: false, whatsappOptOutAt: new Date() } },
  )
  return true
}

/**
 * Processes one verified webhook payload. Returns a small summary for
 * logging/testing. Never throws on a single malformed item - Meta retries
 * anything we don't 200, and one bad status shouldn't force a replay of
 * the whole batch.
 */
export async function processWebhookPayload(payload) {
  const summary = { statusUpdates: 0, optOuts: 0 }

  for (const value of extractChangeValues(payload)) {
    for (const status of Array.isArray(value.statuses) ? value.statuses : []) {
      try {
        if (await applyStatusUpdate(status)) summary.statusUpdates += 1
      } catch (err) {
        console.error('[whatsapp] failed to apply status update:', err.message)
      }
    }

    for (const message of Array.isArray(value.messages) ? value.messages : []) {
      try {
        if (await applyInboundMessage(message)) summary.optOuts += 1
      } catch (err) {
        console.error('[whatsapp] failed to apply inbound message:', err.message)
      }
    }
  }

  return summary
}
