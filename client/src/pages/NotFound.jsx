import { Link } from 'react-router-dom'
import { FileQuestion } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gray-50 dark:bg-gray-950">
      <FileQuestion size={32} className="text-gray-400 dark:text-gray-600" />
      <p className="text-lg font-medium text-gray-700 dark:text-gray-300">
        Page not found
      </p>
      <Link to="/dashboard" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
        Back to dashboard
      </Link>
    </div>
  )
}
