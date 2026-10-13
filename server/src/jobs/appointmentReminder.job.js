import cron from 'node-cron'
import { env } from '../config/env.js'
import { Appointment } from '../models/Appointment.js'
import { Clinic } from '../models/Clinic.js'
import * as whatsapp from '../services/whatsapp.service.js'
import * as email from '../services/email.service.js'
import { todayDateStr, addDaysToDateStr, dayRange, localHourOf, DEFAULT_TIMEZONE } from '../utils/dateRange.js'

// Day-before appointment reminders.
//
// This is the one trigger point with no event to hang off - nothing in the
// app fires "24 hours before an appointment" - so it is a scheduled sweep
// rather than a hook. Runs once a day and reminds every still-live
// appointment scheduled for tomorrow - on WhatsApp and/or by email, for
// clinics that have either turned on.
//
// Deliberately NOT a job queue (no BullMQ/Redis in v1). At small-clinic
// volume a daily in-process sweep is the right size of machinery; if this
// grows past a few thousand appointments a night, it wants to become a
// real worker rather than a bigger cron.

// Reminders go out at this hour on EACH CLINIC's own clock (default 18:00 -
// late enough that tomorrow's bookings are mostly in, early enough not to
// message people at night). The job ticks hourly and only handles clinics
// whose local time is currently this hour, so the server's own time zone
// (UTC on most hosts) never decides when a patient is messaged.
const REMINDER_LOCAL_HOUR = Number(process.env.WHATSAPP_REMINDER_HOUR ?? 18)
const REMINDER_CRON = '0 * * * *'

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
export async function sendTomorrowsReminders({ atLocalHour } = {}) {
  const summary = { clinics: 0, appointments: 0 }
  const now = new Date()

  // Only active clinics with WhatsApp or email on. The global kill
  // switches are checked by the caller and again inside each send, which
  // also applies each channel's own clinic toggle.
  // The hourly tick passes atLocalHour, keeping only the clinics whose
  // local clock is on that hour right now; called directly, it does all.
  const clinics = (
    await Clinic.find({ active: true, $or: [{ whatsappEnabled: true }, { emailEnabled: true }] }).select('_id timezone')
  ).filter(
    (clinic) => atLocalHour === undefined || localHourOf(now, clinic.timezone || DEFAULT_TIMEZONE) === atLocalHour,
  )
  summary.clinics = clinics.length
  if (clinics.length === 0) return summary

  // "Tomorrow" is each clinic's own tomorrow, in its own time zone.
  const appointments = (
    await Promise.all(
      clinics.map((clinic) => {
        const tz = clinic.timezone || DEFAULT_TIMEZONE
        const { start, end } = dayRange(addDaysToDateStr(todayDateStr(tz), 1), tz)
        return Appointment.find({
          clinicId: clinic._id,
          scheduledAt: { $gte: start, $lte: end },
          status: { $in: REMINDABLE_STATUSES },
        })
      }),
    )
  ).flat()

  for (const appointment of appointments) {
    whatsapp.notifyAppointmentReminder(appointment)
    email.notifyAppointmentReminder(appointment)
  }
  summary.appointments = appointments.length

  // Wait for the fan-out to settle before resolving. Unlike the
  // request-path trigger points there is nothing to keep waiting here, and
  // a cron tick that returns while sends are still in flight would be
  // impossible to reason about in logs.
  await Promise.all([whatsapp.flushWhatsappSends(), email.flushEmailSends()])
  return summary
}

let task = null

/**
 * Starts the daily schedule. No-ops unless WhatsApp or email is enabled
 * globally,
 * and never runs under NODE_ENV=test - a test run must not start a timer
 * that outlives it, let alone one that could message anybody.
 */
export function startAppointmentReminderJob() {
  if (env.nodeEnv === 'test') return null
  if (!env.whatsapp.enabled && !env.email.enabled) return null
  if (task) return task

  task = cron.schedule(REMINDER_CRON, async () => {
    try {
      const summary = await sendTomorrowsReminders({ atLocalHour: REMINDER_LOCAL_HOUR })
      if (summary.clinics === 0) return
      // eslint-disable-next-line no-console -- scheduled job needs an operational trail
      console.log(
        `[reminders] reminder sweep: ${summary.appointments} appointment(s) across ${summary.clinics} clinic(s) at local ${REMINDER_LOCAL_HOUR}:00`,
      )
    } catch (err) {
      console.error('[reminders] reminder sweep failed:', err.message)
    }
  })

  // eslint-disable-next-line no-console -- confirms at boot that reminders are live
  console.log(`[reminders] appointment reminder job scheduled: hourly, sending at ${REMINDER_LOCAL_HOUR}:00 clinic time`)
  return task
}

export function stopAppointmentReminderJob() {
  if (task) {
    task.stop()
    task = null
  }
}
