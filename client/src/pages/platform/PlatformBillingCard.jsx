import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Button from '../../components/Button.jsx'
import { updateClinicBilling } from '../../api/platform.js'
import { billingSummaryLine, planName } from '../../utils/billing.js'
import { formatDate } from './format.js'

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:[color-scheme:dark]'
const labelClass =
  'mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400'

const dateInputValue = (value) =>
  value ? new Date(value).toISOString().slice(0, 10) : ''
// A date picked here means "through the end of that day".
const endOfDay = (dateStr) => new Date(`${dateStr}T23:59:59`).toISOString()

// The clinic's subscription as Clinix support sees it, plus the two things
// support can change by hand: the trial end, and a plan paid for outside
// Razorpay (bank transfer) or given free.
export default function PlatformBillingCard({ clinicId, billing }) {
  const queryClient = useQueryClient()
  const [trialEnd, setTrialEnd] = useState(dateInputValue(billing.trialEndsAt))
  const [manualPlan, setManualPlan] = useState(
    billing.status === 'manual' ? billing.plan : 'clinic',
  )
  const [paidUntil, setPaidUntil] = useState('')
  const [note, setNote] = useState('')
  const [message, setMessage] = useState(null)

  const mutation = useMutation({
    mutationFn: (payload) => updateClinicBilling(clinicId, payload),
    onSuccess: () => {
      setMessage({ ok: true, text: 'Saved.' })
      queryClient.invalidateQueries({ queryKey: ['platform'] })
    },
    onError: (err) =>
      setMessage({
        ok: false,
        text:
          err.response?.data?.message ??
          'Something went wrong. Please try again.',
      }),
  })
  const save = (payload) => {
    setMessage(null)
    mutation.mutate(payload)
  }

  return (
    <section className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <h2 className="mb-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
        Subscription
      </h2>
      <p className="text-sm text-gray-700 dark:text-gray-300">
        {billingSummaryLine(billing)}
      </p>
      {billing.enforced && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Access:{' '}
          {billing.access === 'grace' ? 'full (grace period)' : billing.access}
          {billing.readOnlyFrom &&
            billing.access !== 'readonly' &&
            ` · read-only from ${formatDate(billing.readOnlyFrom)}`}
          {' · '}
          {billing.usage.doctors}{' '}
          {billing.usage.doctors === 1 ? 'doctor' : 'doctors'},{' '}
          {billing.usage.staff} staff
        </p>
      )}

      {billing.subscriptions?.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-gray-600 dark:text-gray-400">
          {billing.subscriptions.map((s) => (
            <li key={s.id} className="break-words">
              <span className="font-mono">{s.id}</span> ·{' '}
              {planName(billing, s.plan)} · {s.status}
              {s.cancelAtCycleEnd && ' (ends at period end)'}
              {s.currentEnd && ` · paid to ${formatDate(s.currentEnd)}`}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 space-y-4 border-t border-gray-100 pt-4 dark:border-gray-800">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor="trial-end" className={labelClass}>
              Trial ends
            </label>
            <input
              id="trial-end"
              type="date"
              className={inputClass}
              value={trialEnd}
              onChange={(e) => setTrialEnd(e.target.value)}
            />
          </div>
          <Button
            variant="secondary"
            disabled={!trialEnd || mutation.isPending}
            onClick={() => save({ trialEndsAt: endOfDay(trialEnd) })}
          >
            Set trial end
          </Button>
        </div>

        <fieldset className="min-w-0 space-y-2">
          <legend className="mb-1 text-xs font-semibold text-gray-700 dark:text-gray-300">
            Paid outside Razorpay, or free
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label htmlFor="manual-plan" className={labelClass}>
                Plan
              </label>
              <select
                id="manual-plan"
                className={inputClass}
                value={manualPlan}
                onChange={(e) => setManualPlan(e.target.value)}
              >
                {billing.plans.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="manual-until" className={labelClass}>
                Paid until
              </label>
              <input
                id="manual-until"
                type="date"
                className={inputClass}
                value={paidUntil}
                onChange={(e) => setPaidUntil(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label htmlFor="manual-note" className={labelClass}>
              Note (only you see this)
            </label>
            <input
              id="manual-note"
              className={inputClass}
              maxLength={300}
              placeholder="e.g. Bank transfer, 3 months"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!paidUntil || mutation.isPending}
              onClick={() =>
                save({
                  manualPlan,
                  manualPaidUntil: endOfDay(paidUntil),
                  manualNote: note,
                })
              }
            >
              Save plan
            </Button>
            {billing.status === 'manual' && (
              <Button
                variant="ghost"
                disabled={mutation.isPending}
                onClick={() =>
                  save({
                    manualPlan: null,
                    manualPaidUntil: null,
                    manualNote: '',
                  })
                }
              >
                Remove manual plan
              </Button>
            )}
          </div>
        </fieldset>

        {message && (
          <p
            role={message.ok ? 'status' : 'alert'}
            className={`text-sm ${message.ok ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
          >
            {message.text}
          </p>
        )}
      </div>
    </section>
  )
}
