import { AlertTriangle } from 'lucide-react'
import Button from './Button.jsx'

export default function ErrorState({
  title = 'Something went wrong',
  description = 'Please try again. If the problem continues, contact support.',
  onRetry,
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 rounded-xl border border-red-100 bg-red-50 py-16 text-center dark:border-red-900/40 dark:bg-red-950/30"
    >
      <AlertTriangle
        size={28}
        className="text-red-500 dark:text-red-400"
        aria-hidden="true"
      />
      <div>
        <p className="text-sm font-medium text-red-700 dark:text-red-300">
          {title}
        </p>
        <p className="mt-1 text-sm text-red-600/80 dark:text-red-400/80">
          {description}
        </p>
      </div>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}
