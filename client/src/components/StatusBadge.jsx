import clsx from 'clsx'

const COLORS = {
  BOOKED: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  ARRIVED: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300',
  WAITING: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  IN_CONSULTATION: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  COMPLETED: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  CANCELLED: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  NO_SHOW: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  // Invoice payment statuses - distinct string values from the
  // appointment statuses above, so they share this one map safely.
  PENDING: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  PARTIAL: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  PAID: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  REFUNDED: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  // Staff active/inactive - distinct string values from the above, so they
  // share this one map safely too.
  ACTIVE: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
  INACTIVE: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
}

const LABELS = {
  BOOKED: 'Booked',
  ARRIVED: 'Arrived',
  WAITING: 'Waiting',
  IN_CONSULTATION: 'In Consultation',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No-show',
  PENDING: 'Pending',
  PARTIAL: 'Partially Paid',
  PAID: 'Paid',
  REFUNDED: 'Refunded',
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
}

export default function StatusBadge({ status }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        COLORS[status] ?? COLORS.BOOKED,
      )}
    >
      {LABELS[status] ?? status}
    </span>
  )
}
