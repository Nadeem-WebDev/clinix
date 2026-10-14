// A doctor's working hours (doctorProfile.workingHours, set in their
// profile) as the booking screens need them. Mirrors the server's
// utils/doctorHours.js, which has the final say: these only warn early.
import { DAYS_OF_WEEK } from '../schemas/clinic.js'

export const DAY_LABELS = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
}

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

// "17:30" -> "5:30 PM"
export function formatTime12h(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

export function weekdayOf(dateStr) {
  const sundayFirst = new Date(`${dateStr}T00:00:00.000Z`).getUTCDay()
  return DAYS_OF_WEEK[(sundayFirst + 6) % 7]
}

// null when the doctor has no fixed hours (bookable any time); otherwise
// that day's sessions, [] for a day off.
export function sessionsOn(doctor, dateStr) {
  const hours = doctor?.doctorProfile?.workingHours
  if (!hours?.length || !dateStr) return null
  const entry = hours.find((d) => d.day === weekdayOf(dateStr))
  return entry?.isAvailable ? entry.sessions : []
}

export function fitsHours(sessions, time, durationMinutes) {
  if (!sessions || !time) return true
  const start = toMinutes(time)
  const end = start + durationMinutes
  return sessions.some(
    (s) => toMinutes(s.start) <= start && end <= toMinutes(s.end),
  )
}

// "10:00 AM-1:00 PM and 5:00 PM-8:00 PM"
export function formatSessions(sessions) {
  return sessions
    .map((s) => `${formatTime12h(s.start)}-${formatTime12h(s.end)}`)
    .join(' and ')
}
