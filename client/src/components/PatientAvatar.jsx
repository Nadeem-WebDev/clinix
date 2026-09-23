const COLORS = [
  'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  'bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300',
]

function initials(name = '') {
  const parts = name.trim().split(/\s+/)
  return (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')
}

function colorFor(name = '') {
  let hash = 0
  for (let i = 0; i < name.length; i += 1) hash = (hash + name.charCodeAt(i)) % COLORS.length
  return COLORS[hash]
}

export default function PatientAvatar({ name, size = 36 }) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full text-sm font-semibold ${colorFor(name)}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {initials(name).toUpperCase() || '?'}
    </div>
  )
}
