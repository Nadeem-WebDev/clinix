import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Info, Lock } from 'lucide-react'
import { getBilling } from '../api/billing.js'
import { useAuth } from '../context/AuthContext.jsx'
import { billingBanner } from '../utils/billing.js'

const TONES = {
  info: {
    Icon: Info,
    className:
      'bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200',
  },
  warning: {
    Icon: AlertTriangle,
    className:
      'bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
  },
  danger: {
    Icon: Lock,
    className: 'bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-200',
  },
}

// A strip under the header when the subscription needs attention: trial
// ending, payment failed, read-only. Only the owner can pay, so only the
// owner gets the link; everyone else is told who to ask.
export default function BillingBanner() {
  const { user } = useAuth()
  const { data: billing } = useQuery({
    queryKey: ['billing'],
    queryFn: getBilling,
    staleTime: 5 * 60 * 1000,
  })
  const banner = billingBanner(billing)
  if (!banner) return null

  const { Icon, className } = TONES[banner.tone]
  return (
    <div
      role={banner.tone === 'info' ? 'status' : 'alert'}
      className={`flex shrink-0 items-start gap-2 px-4 py-2.5 text-sm sm:px-6 ${className}`}
    >
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <p>
        {banner.text}{' '}
        {user?.role === 'owner' ? (
          <Link
            to="/settings/subscription"
            className="font-semibold underline underline-offset-2"
          >
            {banner.action}
          </Link>
        ) : (
          banner.tone !== 'info' && 'Please ask the clinic owner to renew it.'
        )}
      </p>
    </div>
  )
}
