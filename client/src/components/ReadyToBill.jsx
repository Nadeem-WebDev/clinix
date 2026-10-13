import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Receipt } from 'lucide-react'
import { listReadyToBill } from '../api/invoices.js'
import Button from './Button.jsx'
import PatientAvatar from './PatientAvatar.jsx'
import { WalkInTag } from './StatusBadge.jsx'
import GenerateBillModal from './GenerateBillModal.jsx'

// The front desk's handover from the doctor: today's visits marked completed
// that haven't been billed. Shown at the top of the Billing page, and only
// when there is someone to bill. Creating a bill opens it (GenerateBillModal)
// and invalidates ['invoices'], which also refreshes this list.
export default function ReadyToBill() {
  const [billing, setBilling] = useState(null)
  const { data: visits, isError } = useQuery({
    queryKey: ['invoices', 'ready-to-bill'],
    queryFn: listReadyToBill,
  })

  if (isError) {
    return (
      <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">
        Couldn&apos;t load the visits waiting to be billed.
      </p>
    )
  }
  if (!visits?.length) return null

  return (
    <section aria-labelledby="ready-to-bill" className="mb-6">
      <h2 id="ready-to-bill" className="mb-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
        Ready to bill ({visits.length})
      </h2>
      <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
        Seen by the doctor today and not billed yet.
      </p>
      <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
        {visits.map((v) => (
          <li
            key={v.appointmentId}
            className="flex flex-wrap items-center justify-between gap-3 bg-white px-4 py-3 dark:bg-gray-900"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="w-8 shrink-0 text-center text-sm font-semibold text-gray-400 dark:text-gray-500">
                {v.tokenNumber}
              </span>
              <PatientAvatar name={v.patient?.fullName} size={32} />
              <div className="min-w-0">
                <p className="break-words text-sm font-medium text-gray-900 dark:text-gray-100">
                  {v.patient?.fullName}
                  {v.isWalkIn && <WalkInTag />}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Dr. {v.doctor?.name}
                  {v.completedAt &&
                    ` · done ${new Date(v.completedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
                </p>
              </div>
            </div>
            <Button variant="secondary" onClick={() => setBilling(v)}>
              <Receipt size={16} aria-hidden="true" />
              Generate Bill
            </Button>
          </li>
        ))}
      </ul>

      <GenerateBillModal
        open={Boolean(billing)}
        onClose={() => setBilling(null)}
        patientId={billing?.patient?._id}
        doctorId={billing?.doctor?._id}
        appointmentId={billing?.appointmentId}
        consultationId={billing?.consultationId ?? undefined}
      />
    </section>
  )
}
