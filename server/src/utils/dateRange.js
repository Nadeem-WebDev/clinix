// Shared by appointments, dashboard, and reports - all of them bucket
// activity by calendar day. Day boundaries are computed in UTC, not the
// clinic's local timezone (see README known limitations).

export function dateStrOf(date) {
  return new Date(date).toISOString().slice(0, 10) // YYYY-MM-DD (UTC day)
}

export function todayDateStr() {
  return dateStrOf(new Date())
}

export function dayRange(dateStr) {
  const start = new Date(`${dateStr}T00:00:00.000Z`)
  const end = new Date(`${dateStr}T23:59:59.999Z`)
  return { start, end }
}

export function addDaysToDateStr(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return dateStrOf(d)
}

// Inclusive [start, end] range from optional YYYY-MM-DD strings, defaulting
// to the last `defaultDays` days (today included) when neither is given.
export function resolveDateRange({ from, to }, defaultDays = 30) {
  const today = todayDateStr()
  const toStr = to ?? today
  const fromStr = from ?? addDaysToDateStr(toStr, -(defaultDays - 1))
  return {
    fromStr,
    toStr,
    start: dayRange(fromStr).start,
    end: dayRange(toStr).end,
  }
}
