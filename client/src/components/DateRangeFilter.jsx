import { localDateStr, localDaysAgo } from '../utils/date.js'

const PRESETS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
]

export default function DateRangeFilter({ from, to, onChange }) {
  const activePreset = PRESETS.find((p) => from === localDaysAgo(p.days) && to === localDateStr())

  return (
    // w-full + min-w-0 on a phone: when this sits inside a flex row (Audit
    // Logs), a flex item otherwise refuses to shrink below its content.
    <div className="flex w-full min-w-0 flex-wrap items-center gap-3 sm:w-auto">
      {/* On a phone the presets split the row evenly and drop "Last " -
          all three at full length are ~300px, wider than a 320px iPhone SE. */}
      <div className="flex w-full rounded-lg border border-gray-200 p-1 dark:border-gray-800 sm:w-auto">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onChange({ from: localDaysAgo(p.days), to: localDateStr() })}
            className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors sm:flex-none ${
              activePreset?.label === p.label
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
            }`}
          >
            <span className="hidden sm:inline">Last </span>
            {p.days} days
          </button>
        ))}
      </div>
      {/* On a phone the two dates share the row and may shrink (min-w-0),
          rather than each keeping its natural width - at iOS's 16px input
          text they no longer fit a 320px iPhone SE otherwise. */}
      <div className="flex w-full items-center gap-2 text-sm sm:w-auto">
        <input
          type="date"
          aria-label="From date"
          value={from}
          onChange={(e) => onChange({ from: e.target.value, to })}
          className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:[color-scheme:dark] sm:flex-none"
        />
        <span className="text-gray-400">to</span>
        <input
          type="date"
          aria-label="To date"
          value={to}
          onChange={(e) => onChange({ from, to: e.target.value })}
          className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:[color-scheme:dark] sm:flex-none"
        />
      </div>
    </div>
  )
}
