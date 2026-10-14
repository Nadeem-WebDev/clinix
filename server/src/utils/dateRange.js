// Shared by appointments, the queue, dashboard, reports and patient history -
// all of them bucket activity by calendar day. A day is the CLINIC's day:
// every helper that has to decide which day an instant falls on takes the
// clinic's IANA time zone (Clinic.timezone, e.g. 'Asia/Kolkata') and refuses
// to run without one, so a forgotten call site fails loudly in tests instead
// of quietly falling back to UTC. Pure calendar arithmetic on 'YYYY-MM-DD'
// strings (addDaysToDateStr) needs no zone.
//
// Built on Intl only - no date library - and DST-safe: offsets are looked up
// for the instant in question, not assumed constant.

export const DEFAULT_TIMEZONE = 'Asia/Kolkata'

export function isValidTimeZone(tz) {
  if (typeof tz !== 'string' || !tz) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

function requireTz(tz) {
  if (!tz) throw new Error('A clinic time zone is required for day calculations')
}

const pad2 = (n) => String(n).padStart(2, '0')

const formatters = new Map()
function formatterFor(tz) {
  if (!formatters.has(tz)) {
    formatters.set(
      tz,
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    )
  }
  return formatters.get(tz)
}

function zonedParts(date, tz) {
  const parts = {}
  for (const { type, value } of formatterFor(tz).formatToParts(date)) parts[type] = Number(value)
  return parts
}

// How far ahead of UTC the zone's wall clock is at this instant, in ms.
function offsetMs(date, tz) {
  const p = zonedParts(date, tz)
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return wallAsUtc - Math.floor(date.getTime() / 1000) * 1000
}

// 'YYYY-MM-DD' of the day this instant falls on in the clinic's zone.
export function dateStrOf(date, tz) {
  requireTz(tz)
  const p = zonedParts(new Date(date), tz)
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`
}

// Hour (0-23) on the clinic's wall clock at this instant.
export function localHourOf(date, tz) {
  requireTz(tz)
  return zonedParts(new Date(date), tz).hour
}

// 'HH:mm' (24-hour) on the clinic's wall clock at this instant.
export function localTimeOf(date, tz) {
  requireTz(tz)
  const p = zonedParts(new Date(date), tz)
  return `${pad2(p.hour)}:${pad2(p.minute)}`
}

export function todayDateStr(tz) {
  return dateStrOf(new Date(), tz)
}

// The instant at which the clinic's wall clock shows `timeStr` on `dateStr`.
// The second pass corrects the guess when a DST change falls between the
// UTC guess and the real instant.
export function zonedTimeToUtc(dateStr, timeStr, tz) {
  requireTz(tz)
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = (timeStr || '00:00').split(':').map(Number)
  const wall = Date.UTC(y, m - 1, d, hh, mm)
  let ts = wall - offsetMs(new Date(wall), tz)
  ts = wall - offsetMs(new Date(ts), tz)
  return new Date(ts)
}

export function addDaysToDateStr(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// [first instant, last instant] of the clinic's calendar day `dateStr`.
export function dayRange(dateStr, tz) {
  const start = zonedTimeToUtc(dateStr, '00:00', tz)
  const end = new Date(zonedTimeToUtc(addDaysToDateStr(dateStr, 1), '00:00', tz).getTime() - 1)
  return { start, end }
}

// For date-only fields (a follow-up date): the form sends 'YYYY-MM-DD',
// stored as midnight UTC, which is a calendar date rather than an instant -
// read it back as that date, or a clinic behind UTC would see the day
// before. Anything else (a real timestamp) is placed in the clinic's day.
export function calendarDateOf(date, tz) {
  const d = new Date(date)
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0) {
    return d.toISOString().slice(0, 10)
  }
  return dateStrOf(d, tz)
}

// Inclusive [start, end] range from optional YYYY-MM-DD strings, defaulting
// to the last `defaultDays` days (today included) when neither is given.
export function resolveDateRange({ from, to }, tz, defaultDays = 30) {
  const today = todayDateStr(tz)
  const toStr = to ?? today
  const fromStr = from ?? addDaysToDateStr(toStr, -(defaultDays - 1))
  return {
    fromStr,
    toStr,
    start: dayRange(fromStr, tz).start,
    end: dayRange(toStr, tz).end,
  }
}
