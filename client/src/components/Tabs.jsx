import clsx from 'clsx'

// Tabs wrap onto a second line rather than scrolling sideways. On phones
// they are pill buttons, which still read as tabs when wrapped; from md up
// they are the usual underlined tabs.
export default function Tabs({ tabs, active, onChange }) {
  return (
    <div
      role="tablist"
      className="flex flex-wrap gap-1.5 md:gap-x-1 md:gap-y-0 md:border-b md:border-gray-200 md:dark:border-gray-800"
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={active === tab.key}
          onClick={() => onChange(tab.key)}
          className={clsx(
            'whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors md:rounded-none md:border-b-2 md:py-2',
            active === tab.key
              ? 'bg-blue-600 text-white md:border-blue-600 md:bg-transparent md:text-blue-700 md:dark:border-blue-400 md:dark:text-blue-300'
              : 'bg-gray-100 text-gray-600 hover:text-gray-900 dark:bg-gray-800 dark:text-gray-300 md:border-transparent md:bg-transparent md:text-gray-500 md:hover:text-gray-700 md:dark:bg-transparent md:dark:text-gray-400 md:dark:hover:text-gray-200',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
