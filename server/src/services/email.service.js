import crypto from 'node:crypto'
import mongoose from 'mongoose'
import { env, publicAppUrl } from '../config/env.js'
import { Clinic } from '../models/Clinic.js'
import { Patient } from '../models/Patient.js'
import { EmailMessage } from '../models/EmailMessage.js'
import { emailClient } from './emailClient.js'
import {
  formatMessageDate,
  formatMessageTime,
  buildPublicQueueUrl,
  clinicContact,
  DOCUMENT_PICKUP_FALLBACK,
} from './whatsapp.service.js'
import {
  appointmentConfirmationEmail,
  appointmentReminderEmail,
  queueUpdateEmail,
  documentReadyEmail,
} from './emailTemplates.js'

// Outbound notification emails, via Brevo - the email twin of
// whatsapp.service.js, sent at the same moments with the same wording.
//
// SAME CONTRACT AS WHATSAPP: sending an email is never allowed to fail a
// primary action. Every path through sendNotificationEmail resolves, and
// callers fire it without awaiting. An EmailMessage row is written on every
// outcome, including the deliberate non-sends.
//
// Unlike WhatsApp, replies can reach the clinic: each email goes out under
// the clinic's name, with the clinic's own address (when it has one) as
// Reply-To. The shared From address is the platform's verified Brevo
// sender.
//
// Not built (v1), as with WhatsApp: no retry, no delivery-status webhooks.

const pendingSends = new Set()

function logSkip(reason, context) {
  // eslint-disable-next-line no-console -- operational trail for a path that intentionally sends nothing
  console.info(`[email] skipped (${reason})`, context)
}

function logFailure(err, context) {
  console.error(`[email] send failed: ${err.message}`, context)
}

async function recordMessage(fields) {
  try {
    return await EmailMessage.create(fields)
  } catch (err) {
    // The log row failing must not become the thing that breaks a booking.
    console.error('[email] failed to write message log:', err.message)
    return null
  }
}

// --- Unsubscribe -----------------------------------------------------------

// The link in every email's footer. Signed with the server secret, so it
// can't be forged for another patient, and needs no login - the patient
// has no account. It opens a page in the app (client/src/pages/
// EmailUnsubscribe.jsx) that asks before unsubscribing, so a mail scanner
// that pre-opens links doesn't unsubscribe anyone by itself.
function unsubscribeSignature(patientId) {
  return crypto.createHmac('sha256', env.jwt.secret).update(`email-unsubscribe:${patientId}`).digest('base64url')
}

export function buildUnsubscribeUrl(patientId) {
  const id = String(patientId)
  return `${publicAppUrl}/email/unsubscribe?p=${id}&t=${unsubscribeSignature(id)}`
}

/**
 * Turns email off for the patient a valid unsubscribe link names. Returns
 * the clinic's name for the confirmation page, or null when the link is not
 * valid (wrong signature, unknown patient). Idempotent - a second click
 * keeps the original opt-out date.
 */
export async function unsubscribeFromEmail(patientId, signature) {
  if (!mongoose.Types.ObjectId.isValid(patientId) || typeof signature !== 'string') return null
  const expected = Buffer.from(unsubscribeSignature(String(patientId)))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null

  const patient = await Patient.findById(patientId).select('clinicId emailOptIn')
  if (!patient) return null
  if (patient.emailOptIn !== false) {
    await Patient.updateOne({ _id: patient._id }, { $set: { emailOptIn: false, emailOptOutAt: new Date() } })
  }
  const clinic = await Clinic.findById(patient.clinicId).select('name')
  return { clinicName: clinic?.name ?? 'your clinic' }
}

// --- Sending ---------------------------------------------------------------

/**
 * Sends one notification email. `compose(ctx)` builds { subject, html, text }
 * from the loaded clinic and patient. Resolves in every case - on success,
 * on a deliberate skip, and on failure - with the EmailMessage written, or
 * null if even the logging failed.
 */
export async function sendNotificationEmail({ clinicId, patientId, kind, compose, relatedResourceType, relatedResourceId }) {
  try {
    const [clinic, patient] = await Promise.all([
      Clinic.findById(clinicId),
      Patient.findOne({ _id: patientId, clinicId }),
    ])
    if (!clinic || !patient) {
      logSkip('clinic or patient not found', { clinicId, patientId })
      return null
    }

    const base = { clinicId, patientId, kind, toEmail: patient.email || undefined, relatedResourceType, relatedResourceId }

    // Two independent switches, both of which must be on - the global one
    // first, so a platform-wide disable is provably total.
    if (!env.email.enabled) {
      logSkip('EMAIL_ENABLED is not true', { kind, clinicId })
      return recordMessage({ ...base, status: 'QUEUED', errorMessage: 'Not sent: email sending is disabled platform-wide (EMAIL_ENABLED)' })
    }
    if (!clinic.emailEnabled) {
      logSkip('clinic has email disabled', { kind, clinicId })
      return recordMessage({ ...base, status: 'QUEUED', errorMessage: 'Not sent: email is disabled for this clinic' })
    }
    if (patient.emailOptIn === false) {
      logSkip('patient unsubscribed', { kind, clinicId, patientId })
      return recordMessage({ ...base, status: 'QUEUED', errorMessage: 'Not sent: patient has unsubscribed from emails' })
    }
    // Email is optional at registration, so a missing address is routine -
    // a deliberate skip, not a failure.
    if (!patient.email) {
      return recordMessage({ ...base, status: 'QUEUED', errorMessage: 'Not sent: patient has no email address' })
    }
    if (!env.email.brevoApiKey || !env.email.fromAddress) {
      logSkip('Brevo not configured', { kind, clinicId })
      return recordMessage({ ...base, status: 'FAILED', errorMessage: 'Not sent: BREVO_API_KEY or EMAIL_FROM_ADDRESS is not set' })
    }

    const { subject, html, text } = compose({ clinic, patient, unsubscribeUrl: buildUnsubscribeUrl(patient._id) })
    try {
      const response = await emailClient.sendEmail({
        to: { email: patient.email, name: patient.fullName },
        sender: { name: `${clinic.name} via ${env.email.fromName}`, email: env.email.fromAddress },
        replyTo: clinic.email ? { email: clinic.email, name: clinic.name } : null,
        subject,
        html,
        text,
        tags: [kind],
      })
      return recordMessage({ ...base, subject, status: 'SENT', providerMessageId: response?.messageId, sentAt: new Date() })
    } catch (err) {
      logFailure(err, { kind, clinicId, patientId, status: err.status })
      return recordMessage({ ...base, subject, status: 'FAILED', errorMessage: err.message?.slice(0, 500) })
    }
  } catch (err) {
    // Belt and braces: a bug above, or a DB read failing, still must not
    // surface to the caller.
    logFailure(err, { kind, clinicId, patientId })
    return null
  }
}

// Registers work in pendingSends so tests (and the reminder sweep) can wait
// for it, and guarantees the returned promise never rejects.
function fireAndForget(payload) {
  const promise = sendNotificationEmail(payload)
    .catch((err) => {
      logFailure(err, { kind: payload?.kind })
      return null
    })
    .finally(() => pendingSends.delete(promise))
  pendingSends.add(promise)
  return promise
}

/**
 * Waits for every in-flight fire-and-forget email to settle. Used by tests
 * and by the reminder sweep; request handlers never wait.
 */
export async function flushEmailSends() {
  while (pendingSends.size > 0) {
    await Promise.allSettled([...pendingSends])
  }
}

// --- Trigger points ----------------------------------------------------------
//
// Same names and arguments as the WhatsApp helpers, called right beside
// them from the domain services and the reminder job.

function idOf(value) {
  return value?._id ?? value
}

export function notifyAppointmentBooked(appointment) {
  return fireAndForget({
    clinicId: idOf(appointment.clinicId),
    patientId: idOf(appointment.patientId),
    kind: 'APPOINTMENT_CONFIRMATION',
    relatedResourceType: 'Appointment',
    relatedResourceId: appointment._id,
    compose: ({ clinic, patient, unsubscribeUrl }) =>
      appointmentConfirmationEmail({
        clinic,
        patientName: patient.fullName,
        date: formatMessageDate(appointment.scheduledAt, clinic.timezone),
        time: formatMessageTime(appointment.scheduledAt, clinic.timezone),
        token: appointment.tokenNumber,
        contact: clinicContact(clinic),
        unsubscribeUrl,
      }),
  })
}

export function notifyAppointmentReminder(appointment) {
  return fireAndForget({
    clinicId: idOf(appointment.clinicId),
    patientId: idOf(appointment.patientId),
    kind: 'APPOINTMENT_REMINDER',
    relatedResourceType: 'Appointment',
    relatedResourceId: appointment._id,
    compose: ({ clinic, patient, unsubscribeUrl }) =>
      appointmentReminderEmail({
        clinic,
        patientName: patient.fullName,
        date: formatMessageDate(appointment.scheduledAt, clinic.timezone),
        time: formatMessageTime(appointment.scheduledAt, clinic.timezone),
        contact: clinicContact(clinic),
        unsubscribeUrl,
      }),
  })
}

// Same moments as WhatsApp's queue update: this patient marked arrived, or
// called in - never on other patients' queue changes.
export function notifyQueueUpdate(appointment) {
  return fireAndForget({
    clinicId: idOf(appointment.clinicId),
    patientId: idOf(appointment.patientId),
    kind: 'QUEUE_UPDATE',
    relatedResourceType: 'Appointment',
    relatedResourceId: appointment._id,
    compose: ({ clinic, patient, unsubscribeUrl }) =>
      queueUpdateEmail({
        clinic,
        patientName: patient.fullName,
        token: appointment.tokenNumber,
        queueUrl: buildPublicQueueUrl(clinic.slug),
        contact: clinicContact(clinic),
        unsubscribeUrl,
      }),
  })
}

export function notifyDocumentReady({ clinicId, patientId, documentType, resourceType, resourceId }) {
  return fireAndForget({
    clinicId: idOf(clinicId),
    patientId: idOf(patientId),
    kind: 'DOCUMENT_READY',
    relatedResourceType: resourceType,
    relatedResourceId: resourceId,
    compose: ({ clinic, patient, unsubscribeUrl }) =>
      documentReadyEmail({
        clinic,
        patientName: patient.fullName,
        documentType,
        pickup: DOCUMENT_PICKUP_FALLBACK,
        contact: clinicContact(clinic),
        unsubscribeUrl,
      }),
  })
}
