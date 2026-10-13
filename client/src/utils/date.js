// Calendar dates ('YYYY-MM-DD') in the browser's own time zone. Not
// toISOString(), which gives the UTC date - wrong for half the evening/night
// anywhere ahead of UTC (in India, 00:00-05:30 is still "yesterday" in UTC).
// The server treats these strings as the clinic's calendar days
// (Clinic.timezone); staff browsers are assumed to be in the clinic's zone,
// the same assumption every displayed time already makes.
const pad2 = (n) => String(n).padStart(2, '0')

export function localDateStr(date = new Date()) {
  const d = new Date(date)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function addLocalDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

// First day of a "last N days" range that includes today.
export function localDaysAgo(days) {
  return localDateStr(addLocalDays(new Date(), -(days - 1)))
}
