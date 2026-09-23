import { Inbox } from 'lucide-react'

export default function EmptyState({
  icon: Icon = Inbox,
  title = 'Nothing here yet',
  description,
  action,
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-gray-200 py-16 text-center dark:border-gray-800">
      <Icon size={28} className="text-gray-400 dark:text-gray-600" aria-hidden="true" />
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {title}
        </p>
        {description && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  )
}
