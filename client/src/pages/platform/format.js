const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

const STEPS = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

// "3 days ago", "yesterday", "just now".
export function timeAgo(date) {
  const seconds = (new Date(date).getTime() - Date.now()) / 1000
  for (const [unit, size] of STEPS) {
    if (Math.abs(seconds) >= size)
      return relative.format(Math.round(seconds / size), unit)
  }
  return 'just now'
}

export function formatDate(date) {
  return new Date(date).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateTime(date) {
  return new Date(date).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
