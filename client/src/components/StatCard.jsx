// Stat tile: label (sentence case, no trailing colon) + value (semibold,
// auto-compact for big numbers) + an optional icon carrying no meaning
// beyond decoration - identity/severity, if any, comes from the icon's
// color, never from recoloring the value text itself.
function formatCompact(n) {
  const num = Number(n)
  if (!Number.isFinite(num)) return String(n)
  if (Math.abs(num) >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (Math.abs(num) >= 10_000) return `${(num / 1_000).toFixed(1)}K`
  return num.toLocaleString()
}

export default function StatCard({ label, value, icon: Icon, accent = 'text-blue-600 dark:text-blue-400' }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
        {Icon && <Icon size={18} className={accent} aria-hidden="true" />}
      </div>
      <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-100">
        {typeof value === 'number' ? formatCompact(value) : value}
      </p>
    </div>
  )
}
