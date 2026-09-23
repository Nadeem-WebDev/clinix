import { env, publicAppUrl } from '../config/env.js'
import { Clinic } from '../models/Clinic.js'
import { Patient } from '../models/Patient.js'
import { WhatsappMessage } from '../models/WhatsappMessage.js'
import { whatsappClient } from './whatsappClient.js'
import { toE164 } from '../utils/phone.js'

// Outbound WhatsApp, via Meta's Cloud API.
//
// THE CONTRACT THIS FILE MUST NEVER BREAK: sending a WhatsApp message is
// never allowed to fail a primary action. Booking an appointment,
// finalizing a prescription and recording a payment all trigger a send,
// and all of them must succeed exactly as before if Meta is down, slow,
// misconfigured, or returns nonsense. Every path through
// sendTemplateMessage therefore resolves - it logs and returns, it does
// not throw, and callers additionally fire it without awaiting.
//
// A WhatsappMessage row is written on every outcome, including the ones
// where nothing was sent. Being able to show *why* a patient wasn't
// messaged matters as much as showing that they were.
//
// Not built here, on purpose (v1): no retry, no BullMQ/Redis worker, no
// free-form messages inside the 24h customer window. A proper background
// queue is the natural v2 once send volume justifies the operational cost;
// until then a failed send is a FAILED row, not a retry storm.

// Only used to render date/time inside message text. Deliberately NOT
// wired into the day-bucketing used by queue/dashboard/reports, which is
// UTC everywhere (see README known limitations) - this is a display-only
// stopgap so patients don't receive appointment times in UTC. When Clinic
// grows a real timezone field, read it from there and delete this.
const DISPLAY_TIMEZONE = process.env.WHATSAPP_DISPLAY_TIMEZONE || 'Asia/Kolkata'

// In-flight sends, so tests can wait for fire-and-forget work to settle
// instead of racing it. Nothing in production reads this.
const pendingSends = new Set()

function logSkip(reason, context) {
  // eslint-disable-next-line no-console -- operational trail for a path that intentionally sends nothing
  console.info(`[whatsapp] skipped (${reason})`, context)
}

function logFailure(err, context) {
  console.error(`[whatsapp] send failed: ${err.message}`, context)
}

export function formatMessageDate(date) {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: DISPLAY_TIMEZONE,
  }).format(new Date(date))
}

export function formatMessageTime(date) {
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: DISPLAY_TIMEZONE,
  }).format(new Date(date))
}

// The no-login queue page from Feature A - the one link in these messages
// that is safe to send, because the page behind it publishes nothing
// patient-identifying.
export function buildPublicQueueUrl(clinicSlug) {
  return `${publicAppUrl}/q/${clinicSlug}`
}

// Meta's template variable payload: positional {{1}}, {{2}}, ... in the
// order the template was approved with. Order and count must match the
// approved template exactly or Meta rejects the send.
function bodyComponents(values) {
  return [
    {
      type: 'body',
      parameters: values.map((value) => ({ type: 'text', text: String(value ?? '') })),
    },
  ]
}

async function recordMessage(fields) {
  try {
    return await WhatsappMessage.create(fields)
  } catch (err) {
    // The log row failing must not become the thing that breaks a booking.
    console.error('[whatsapp] failed to write message log:', err.message)
    return null
  }
}

/**
 * Sends one approved template message. Resolves in every case - on success,
 * on a deliberate skip, and on failure. Never rejects.
 *
 * Returns the WhatsappMessage document that was written, or null if even
 * the logging failed.
 */
export async function sendTemplateMessage({
  clinicId,
  patientId,
  toPhone,
  templateName,
  languageCode,
  components,
  relatedResourceType,
  relatedResourceId,
}) {
  try {
    const [clinic, patient] = await Promise.all([
      Clinic.findById(clinicId),
      Patient.findOne({ _id: patientId, clinicId }),
    ])

    if (!patient) {
      logSkip('patient not found in clinic', { clinicId, patientId })
      return null
    }

    const phone = toE164(toPhone ?? patient.phone)
    const language = languageCode ?? patient.preferredLanguage ?? 'en'
    const base = {
      clinicId,
      patientId,
      toPhone: phone ?? String(patient.phone ?? ''),
      templateName,
      languageCode: language,
      relatedResourceType,
      relatedResourceId,
    }

    // Two independent switches, both of which must be on. The global one
    // is checked first so that a platform-wide disable is provably total,
    // regardless of per-clinic state.
    if (!env.whatsapp.enabled) {
      logSkip('WHATSAPP_ENABLED is not true', { templateName, clinicId })
      return recordMessage({
        ...base,
        status: 'QUEUED',
        errorMessage: 'Not sent: WhatsApp sending is disabled platform-wide (WHATSAPP_ENABLED)',
      })
    }

    if (!clinic?.whatsappEnabled) {
      logSkip('clinic has WhatsApp disabled', { templateName, clinicId })
      return recordMessage({
        ...base,
        status: 'QUEUED',
        errorMessage: 'Not sent: WhatsApp is disabled for this clinic',
      })
    }

    if (patient.whatsappOptIn === false) {
      logSkip('patient opted out', { templateName, clinicId, patientId })
      return recordMessage({
        ...base,
        status: 'QUEUED',
        errorMessage: 'Not sent: patient has opted out of WhatsApp messages',
      })
    }

    if (!phone) {
      logSkip('no usable phone number', { templateName, clinicId, patientId })
      return recordMessage({
        ...base,
        status: 'FAILED',
        errorMessage: 'Not sent: patient phone number is not a usable E.164 number',
      })
    }

    try {
      const response = await whatsappClient.sendTemplate({
        toPhone: phone,
        templateName,
        languageCode: language,
        components,
      })

      return recordMessage({
        ...base,
        status: 'SENT',
        providerMessageId: response?.messages?.[0]?.id,
        sentAt: new Date(),
      })
    } catch (err) {
      logFailure(err, { templateName, clinicId, patientId, status: err.status })
      return recordMessage({
        ...base,
        status: 'FAILED',
        errorMessage: err.message?.slice(0, 500),
      })
    }
  } catch (err) {
    // Belt and braces: a bug in the branching above, or a DB read failing,
    // still must not surface to the caller.
    logFailure(err, { templateName, clinicId, patientId })
    return null
  }
}

/**
 * Fire-and-forget entry point used by the trigger points in the domain
 * services. Deliberately not awaited by callers: a booking must not wait
 * on Meta. The .catch() is a second safety net behind
 * sendTemplateMessage's own internal handling.
 */
export function queueTemplateMessage(payload) {
  const promise = sendTemplateMessage(payload)
    .catch((err) => {
      logFailure(err, { templateName: payload?.templateName })
      return null
    })
    .finally(() => pendingSends.delete(promise))

  pendingSends.add(promise)
  return promise
}

/**
 * Test support: waits for every in-flight fire-and-forget send to settle.
 * Production code never calls this - trigger points intentionally do not
 * wait, and this only exists so tests can assert on what was written
 * without polling the database.
 */
export async function flushWhatsappSends() {
  while (pendingSends.size > 0) {
    await Promise.allSettled([...pendingSends])
  }
}

// ---------------------------------------------------------------------------
// Trigger-point helpers
//
// Each of these is called from a domain service at a point where something
// happened that a patient would want to know about. They are deliberately
// NOT awaited by their callers - see queueTemplateMessage - and each one
// resolves rather than rejecting.
//
// Variable ORDER and COUNT below must match the template as approved in
// Meta Business Manager. Names are configurable (.env.example); the shape
// of the variable list is not, so changing a template's variables in Meta
// means changing the matching call here.
//
// Each helper re-reads the clinic and patient rather than trusting what
// the caller passed. That costs two indexed reads on a background path,
// and buys the guarantee that the kill switch, the per-clinic toggle and
// the patient's opt-out are always evaluated against current state.
// ---------------------------------------------------------------------------

// Accepts either a raw ObjectId or a populated subdocument, since domain
// services hand back populated appointments.
function idOf(value) {
  return value?._id ?? value
}

async function loadContext(clinicId, patientId) {
  const [clinic, patient] = await Promise.all([
    Clinic.findById(clinicId),
    Patient.findOne({ _id: patientId, clinicId }),
  ])
  return { clinic, patient }
}

// Registers work in pendingSends so tests can await it, and guarantees the
// returned promise never rejects.
function fireAndForget(task) {
  const promise = Promise.resolve()
    .then(task)
    .catch((err) => {
      logFailure(err, {})
      return null
    })
    .finally(() => pendingSends.delete(promise))

  pendingSends.add(promise)
  return promise
}

// {{1}} patient name, {{2}} clinic name, {{3}} date, {{4}} time, {{5}} token
export function notifyAppointmentBooked(appointment) {
  return fireAndForget(async () => {
    const clinicId = idOf(appointment.clinicId)
    const patientId = idOf(appointment.patientId)
    const { clinic, patient } = await loadContext(clinicId, patientId)
    if (!clinic || !patient) return null

    return sendTemplateMessage({
      clinicId,
      patientId,
      toPhone: patient.phone,
      templateName: env.whatsapp.templates.appointmentConfirmation,
      languageCode: patient.preferredLanguage,
      components: bodyComponents([
        patient.fullName,
        clinic.name,
        formatMessageDate(appointment.scheduledAt),
        formatMessageTime(appointment.scheduledAt),
        appointment.tokenNumber,
      ]),
      relatedResourceType: 'Appointment',
      relatedResourceId: appointment._id,
    })
  })
}

// {{1}} patient name, {{2}} clinic name, {{3}} date, {{4}} time
export function notifyAppointmentReminder(appointment) {
  return fireAndForget(async () => {
    const clinicId = idOf(appointment.clinicId)
    const patientId = idOf(appointment.patientId)
    const { clinic, patient } = await loadContext(clinicId, patientId)
    if (!clinic || !patient) return null

    return sendTemplateMessage({
      clinicId,
      patientId,
      toPhone: patient.phone,
      templateName: env.whatsapp.templates.appointmentReminder,
      languageCode: patient.preferredLanguage,
      components: bodyComponents([
        patient.fullName,
        clinic.name,
        formatMessageDate(appointment.scheduledAt),
        formatMessageTime(appointment.scheduledAt),
      ]),
      relatedResourceType: 'Appointment',
      relatedResourceId: appointment._id,
    })
  })
}

// {{1}} patient name, {{2}} token number, {{3}} public queue link
//
// Sent when THIS patient's own position changed in a way they would care
// about - they were marked arrived, or they were just called in. Not sent
// on every queue mutation: skipping someone, or another patient being
// called, does not message the rest of the waiting room. Messaging every
// waiting patient each time the "now serving" token ticks is the fastest
// route to a rate-limited number and mass opt-outs, so the blast radius is
// deliberately one patient per transition.
export function notifyQueueUpdate(appointment) {
  return fireAndForget(async () => {
    const clinicId = idOf(appointment.clinicId)
    const patientId = idOf(appointment.patientId)
    const { clinic, patient } = await loadContext(clinicId, patientId)
    if (!clinic || !patient) return null

    return sendTemplateMessage({
      clinicId,
      patientId,
      toPhone: patient.phone,
      templateName: env.whatsapp.templates.queueUpdate,
      languageCode: patient.preferredLanguage,
      components: bodyComponents([
        patient.fullName,
        appointment.tokenNumber,
        buildPublicQueueUrl(clinic.slug),
      ]),
      relatedResourceType: 'Appointment',
      relatedResourceId: appointment._id,
    })
  })
}

// What goes in document_ready's {{3}}, where a download link would.
//
// DECISION POINT (spec 2.5.3): the prescription and receipt PDF routes
// (/prescriptions/:id/pdf, /invoices/:id/receipt/pdf) both sit behind
// `authenticate`, and Cloudinary's signedUrl() covers only *uploaded*
// patient documents, not these server-generated PDFs. There is no
// short-lived public link mechanism to reuse, and opening an
// unauthenticated PDF route just to satisfy a notification would trade a
// real confidentiality boundary for convenience. So the message says it's
// ready and stops there. When a signed public-link mechanism exists,
// replace this constant with that URL.
export const DOCUMENT_PICKUP_FALLBACK = 'Please collect it from the front desk.'

// {{1}} patient name, {{2}} document type, {{3}} link or pickup instruction
export function notifyDocumentReady({ clinicId, patientId, documentType, resourceType, resourceId }) {
  return fireAndForget(async () => {
    const resolvedClinicId = idOf(clinicId)
    const resolvedPatientId = idOf(patientId)
    const { clinic, patient } = await loadContext(resolvedClinicId, resolvedPatientId)
    if (!clinic || !patient) return null

    return sendTemplateMessage({
      clinicId: resolvedClinicId,
      patientId: resolvedPatientId,
      toPhone: patient.phone,
      templateName: env.whatsapp.templates.documentReady,
      languageCode: patient.preferredLanguage,
      components: bodyComponents([patient.fullName, documentType, DOCUMENT_PICKUP_FALLBACK]),
      relatedResourceType: resourceType,
      relatedResourceId: resourceId,
    })
  })
}
