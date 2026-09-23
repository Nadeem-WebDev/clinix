import cron from 'node-cron'
import { env } from '../config/env.js'
import { Appointment } from '../models/Appointment.js'
import { Clinic } from '../models/Clinic.js'
import * as whatsapp from '../services/whatsapp.service.js'
import { todayDateStr, addDaysToDateStr, dayRange } from '../utils/dateRange.js'

// Day-before appointment reminders.
//
// This is the one trigger point with no event to hang off - nothing in the
// app fires "24 hours before an appointment" - so it is a scheduled sweep
// rather than a hook. Runs once a day and messages every still-live
// appointment scheduled for tomorrow, for clinics that have WhatsApp on.
//
// Deliberately NOT a job queue (no BullMQ/Redis in v1). At small-clinic
// volume a daily in-process sweep is the right size of machinery; if this
// grows past a few thousand appointments a night, it wants to become a
// real worker rather than a bigger cron.

// 18:00 in the server's local timezone - late enough that tomorrow's
// bookings are mostly in, early enough not to message people at night.
const REMINDER_CRON = process.env.WHATSAPP_REMINDER_CRON || '0 18 * * *'

// Reminders are only meaningful for appointments the patient is still
// expected at - not ones already cancelled, no-showed, or completed early.
const REMINDABLE_STATUSES = ['BOOKED', 'WAITING']

/**
 * Sends tomorrow's reminders. Exported separately from the schedule so it
 * can be invoked directly - by a test, or by hand from a REPL - without
 * waiting for 18:00.
 *
 * Returns a summary rather than throwing: one clinic's failure must not
 * stop the others from being processed.
 */
export async function sendTomorrowsReminders() {
  const tomorrow = addDaysToDateStr(todayDateStr(), 1)
  const { start, end } = dayRange(tomorrow)
  const summary = { date: tomorrow, clinics: 0, appointments: 0 }

  // Only clinics that are both active and have opted in. The global kill
  // switch is checked by the caller and again inside sendTemplateMessage.
  const clinics = await Clinic.find({ active: true, whatsappEnabled: true }).select('_id')
  summary.clinics = clinics.length
  if (clinics.length === 0) return summary

  const appointments = await Appointment.find({
    clinicId: { $in: clinics.map((c) => c._id) },
    scheduledAt: { $gte: start, $lte: end },
    status: { $in: REMINDABLE_STATUSES },
  })

  for (const appointment of appointments) {
    whatsapp.notifyAppointmentReminder(appointment)
  }
  summary.appointments = appointments.length

  // Wait for the fan-out to settle before resolving. Unlike the
  // request-path trigger points there is nothing to keep waiting here, and
  // a cron tick that returns while sends are still in flight would be
  // impossible to reason about in logs.
  await whatsapp.flushWhatsappSends()
  return summary
}

let task = null

/**
 * Starts the daily schedule. No-ops unless WhatsApp is enabled globally,
 * and never runs under NODE_ENV=test - a test run must not start a timer
 * that outlives it, let alone one that could message anybody.
 */
export function startAppointmentReminderJob() {
  if (env.nodeEnv === 'test') return null
  if (!env.whatsapp.enabled) return null
  if (task) return task

  task = cron.schedule(REMINDER_CRON, async () => {
    try {
      const summary = await sendTomorrowsReminders()
      // eslint-disable-next-line no-console -- scheduled job needs an operational trail
      console.log(
        `[whatsapp] reminder sweep for ${summary.date}: ${summary.appointments} appointment(s) across ${summary.clinics} clinic(s)`,
      )
    } catch (err) {
      console.error('[whatsapp] reminder sweep failed:', err.message)
    }
  })

  // eslint-disable-next-line no-console -- confirms at boot that reminders are live
  console.log(`[whatsapp] appointment reminder job scheduled (${REMINDER_CRON})`)
  return task
}

export function stopAppointmentReminderJob() {
  if (task) {
    task.stop()
    task = null
  }
}
