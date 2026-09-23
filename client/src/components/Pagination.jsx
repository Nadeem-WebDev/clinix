import { ChevronLeft, ChevronRight } from 'lucide-react'
import Button from './Button.jsx'

export default function Pagination({ page, pages, total, onPageChange }) {
  if (total === 0) return null

  return (
    <div className="flex items-center justify-between border-t border-gray-200 px-1 py-3 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
      <span>
        Page {page} of {pages} · {total} total
      </span>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </Button>
        <Button
          variant="secondary"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight size={16} aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
