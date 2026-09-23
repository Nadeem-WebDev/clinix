import { Loader2 } from 'lucide-react'

export default function LoadingState({ label = 'Loading…' }) {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center gap-2 py-16 text-gray-500 dark:text-gray-400"
    >
      <Loader2 size={24} className="animate-spin" aria-hidden="true" />
      <span className="text-sm">{label}</span>
    </div>
  )
}
