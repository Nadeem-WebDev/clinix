// Report time series come back with only the periods that had data, so a
// closed day simply isn't in the list and a line drawn through it would
// skip straight over it. fillSeries() lays out every period in the range
// (day, ISO week, or month - the same keys the server's $dateToString
// formats produce) and puts 0 where there was nothing.
const DAY_MS = 86_400_000
const pad2 = (n) => String(n).padStart(2, '0')

// 'YYYY-MM-DD' as a UTC midnight - these are calendar dates, not instants,
// so all the arithmetic below stays in UTC to dodge DST.
function parseDay(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`)
}

function dayKey(d) {
  return d.toISOString().slice(0, 10)
}

// Monday of the ISO week a date falls in.
function isoWeekStart(d) {
  return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY_MS)
}

// Same as MongoDB's '%G-W%V': ISO week-numbering year and week 01-53.
function isoWeekKey(d) {
  const thursday = new Date(isoWeekStart(d).getTime() + 3 * DAY_MS)
  const year = thursday.getUTCFullYear()
  const week = Math.floor((thursday - Date.UTC(year, 0, 1)) / (7 * DAY_MS)) + 1
  return `${year}-W${pad2(week)}`
}

function monthKey(d) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`
}

const KEY_OF = { day: dayKey, week: isoWeekKey, month: monthKey }

// First day of the period, as a UTC-midnight Date (for spreadsheet export).
function periodStart(groupBy, d) {
  if (groupBy === 'week') return isoWeekStart(d)
  if (groupBy === 'month')
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
  return d
}

const fmt = (options) =>
  new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', ...options })
const shortDay = fmt({ day: 'numeric', month: 'short' })
const longDay = fmt({
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const shortMonth = fmt({ month: 'short', year: '2-digit' })
const longMonth = fmt({ month: 'long', year: 'numeric' })

// label: short enough for an axis tick on a phone. fullLabel: the tooltip.
function labelsFor(groupBy, firstDay) {
  if (groupBy === 'week') {
    const monday = isoWeekStart(firstDay)
    return {
      label: shortDay.format(monday),
      fullLabel: `Week of ${longDay.format(monday)}`,
    }
  }
  if (groupBy === 'month') {
    return {
      label: shortMonth.format(firstDay),
      fullLabel: longMonth.format(firstDay),
    }
  }
  return {
    label: shortDay.format(firstDay),
    fullLabel: longDay.format(firstDay),
  }
}

// rows: [{ [keyField]: '2026-10-12', [valueField]: 1200 }, ...] from the API.
export function fillSeries(
  rows,
  { from, to, groupBy = 'day', keyField, valueField },
) {
  const keyOf = KEY_OF[groupBy] ?? KEY_OF.day
  const valueByKey = new Map(rows.map((r) => [r[keyField], r[valueField]]))
  const out = []
  const seen = new Set()
  const end = parseDay(to)
  for (let d = parseDay(from); d <= end; d = new Date(d.getTime() + DAY_MS)) {
    const key = keyOf(d)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      key,
      value: valueByKey.get(key) ?? 0,
      start: periodStart(groupBy, d),
      ...labelsFor(groupBy, d),
    })
  }
  return out
}

// Calendar days from..to inclusive.
export function daysInRange(from, to) {
  return Math.max(1, Math.round((parseDay(to) - parseDay(from)) / DAY_MS) + 1)
}

// Axis ticks: "1.2M" / "18L" style, in the browser's own locale.
const compact = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
})
export function compactNumber(n) {
  return compact.format(Number(n) || 0)
}
