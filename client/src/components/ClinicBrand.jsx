import clsx from 'clsx'

// The clinic's own identity in the app shell: its logo (or a monogram tile
// when none is uploaded) next to its name. Falls back to the product name
// until the clinic has loaded, so the shell never renders an empty slot.
export default function ClinicBrand({ clinic, size = 'md', className }) {
  const name = clinic?.name || 'Clinix'
  const tile = size === 'sm' ? 'h-7 w-7 text-xs' : 'h-8 w-8 text-sm'

  return (
    <div className={clsx('flex min-w-0 items-center gap-2.5', className)}>
      {clinic?.logoUrl ? (
        // White tile behind the image so a transparent logo designed for a
        // light background still reads in dark mode.
        <img
          src={clinic.logoUrl}
          alt=""
          className={clsx(tile, 'shrink-0 rounded-md bg-white object-contain p-0.5 ring-1 ring-gray-200 dark:ring-gray-700')}
        />
      ) : (
        <span
          aria-hidden="true"
          className={clsx(
            tile,
            'flex shrink-0 items-center justify-center rounded-md bg-blue-600 font-semibold text-white dark:bg-blue-500',
          )}
        >
          {name.trim().charAt(0).toUpperCase()}
        </span>
      )}
      {/* Two lines before clamping, not one: the name is the point of this
          component, and a typical clinic name ("Sunrise Family Clinic")
          doesn't fit one line in a 240px sidebar or beside the phone menu. */}
      <span
        className={clsx(
          'line-clamp-2 break-words font-semibold leading-tight text-gray-900 dark:text-gray-100',
          size === 'sm' ? 'text-sm' : 'text-base',
        )}
        title={name}
      >
        {name}
      </span>
    </div>
  )
}
