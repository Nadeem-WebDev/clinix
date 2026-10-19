import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  CreditCard,
  Lock,
  Minus,
} from 'lucide-react'
import BackButton from '../components/BackButton.jsx'
import Button from '../components/Button.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import LoadingState from '../components/LoadingState.jsx'
import ErrorState from '../components/ErrorState.jsx'
import {
  getBilling,
  startSubscription,
  confirmCheckout,
  cancelSubscription,
} from '../api/billing.js'
import { openSubscriptionCheckout } from '../utils/razorpayCheckout.js'
import { daysUntil, formatDate, planName, rupees } from '../utils/billing.js'

const errorMessage = (err) =>
  err?.response?.data?.message ??
  err?.message ??
  'Something went wrong. Please try again.'

// What the clinic is on right now, in words.
function StatusCard({ billing }) {
  const plan = billing.plan ? planName(billing, billing.plan) : null
  const scheduled = billing.scheduled
    ? `The ${planName(billing, billing.scheduled.plan)} plan starts on ${formatDate(billing.scheduled.startAt ?? billing.trialEndsAt)}.`
    : null
  const readOnly = billing.access === 'readonly'

  let title
  let detail
  switch (billing.status) {
    case 'trialing': {
      const days = daysUntil(billing.trialEndsAt)
      title = `Free trial - ${days} ${days === 1 ? 'day' : 'days'} left`
      detail =
        scheduled ??
        `Ends on ${formatDate(billing.trialEndsAt)}. Choose a plan any time - you won't be charged until the trial ends.`
      break
    }
    case 'active':
      title = `${plan} plan`
      detail =
        scheduled ??
        (billing.paidUntil
          ? `Renews on ${formatDate(billing.paidUntil)}.`
          : 'Your first payment is being processed.')
      break
    case 'cancelling':
      title = `${plan} plan - cancelled`
      detail =
        scheduled ??
        `Full access until ${formatDate(billing.paidUntil)}. Choose a plan to keep going after that.`
      break
    case 'manual':
      title = `${plan} plan`
      detail = `Paid until ${formatDate(billing.paidUntil)} (arranged with Clinix).`
      break
    case 'past_due':
      title = 'Payment failed'
      detail = readOnly
        ? 'The clinic is read-only. Pay below to add records again.'
        : `Razorpay will retry the payment. If it isn't paid by ${formatDate(billing.readOnlyFrom)}, the clinic becomes read-only - or pay now with another card or UPI.`
      break
    default:
      title = billing.plan ? 'Subscription ended' : 'Free trial ended'
      detail = readOnly
        ? 'The clinic is read-only: records can be viewed and printed, but nothing new can be added. Choose a plan to continue.'
        : `Choose a plan by ${formatDate(billing.readOnlyFrom)} to keep adding records.`
  }

  const warn = billing.status === 'past_due' || billing.status === 'expired'
  return (
    <section
      className={`rounded-xl border p-5 ${
        warn
          ? 'border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30'
          : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Current plan
      </p>
      <h2 className="mt-1 flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
        {readOnly && (
          <Lock
            size={18}
            className="text-red-600 dark:text-red-400"
            aria-hidden="true"
          />
        )}
        {title}
      </h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{detail}</p>
      <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
        Using: {billing.usage.doctors}{' '}
        {billing.usage.doctors === 1 ? 'doctor' : 'doctors'}
        {billing.limits?.maxDoctors != null &&
          ` of ${billing.limits.maxDoctors}`}
        {' · '}
        {billing.usage.staff} staff
        {billing.limits?.maxStaff != null && ` of ${billing.limits.maxStaff}`}
      </p>
    </section>
  )
}

function PlanFeature({ ok, children }) {
  const Icon = ok ? Check : Minus
  return (
    <li
      className={`flex gap-2 text-sm ${ok ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'}`}
    >
      <Icon
        size={18}
        className={`shrink-0 ${ok ? 'text-blue-600 dark:text-blue-400' : ''}`}
        aria-hidden="true"
      />
      <span>
        {children}
        {!ok && <span className="sr-only"> (not included)</span>}
      </span>
    </li>
  )
}

// What the plan button says, and whether it can be pressed.
function planAction(billing, plan) {
  if (!plan.available) return { label: 'Not available yet', disabled: true }
  if (billing.scheduled?.plan === plan.code)
    return {
      label: `Starts ${formatDate(billing.scheduled.startAt)}`,
      disabled: true,
    }
  if (
    billing.plan === plan.code &&
    ['active', 'manual'].includes(billing.status)
  )
    return { label: 'Current plan', disabled: true }
  if (plan.maxDoctors != null && billing.usage.doctors > plan.maxDoctors) {
    return {
      label: `Too many doctors (${billing.usage.doctors})`,
      disabled: true,
    }
  }
  if (plan.maxStaff != null && billing.usage.staff > plan.maxStaff) {
    return { label: `Too many staff (${billing.usage.staff})`, disabled: true }
  }
  if (billing.plan === plan.code)
    return {
      label: billing.status === 'cancelling' ? 'Renew' : 'Pay now',
      disabled: false,
    }
  const subscribed = ['active', 'cancelling', 'manual'].includes(billing.status)
  return {
    label: subscribed ? `Switch to ${plan.name}` : `Choose ${plan.name}`,
    disabled: false,
  }
}

export default function Subscription() {
  const queryClient = useQueryClient()
  const [busyPlan, setBusyPlan] = useState(null)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const {
    data: billing,
    isLoading,
    isError,
    refetch,
  } = useQuery({ queryKey: ['billing'], queryFn: getBilling })

  const setBilling = (next) => queryClient.setQueryData(['billing'], next)

  // Server creates the subscription -> Razorpay's pop-up takes the payment
  // or mandate -> the server checks Razorpay's signature and reads the new
  // state from Razorpay. Closing the pop-up just leaves things as they were.
  const choose = async (plan) => {
    setError(null)
    setNotice(null)
    setBusyPlan(plan.code)
    try {
      const checkout = await startSubscription(plan.code)
      const result = await openSubscriptionCheckout({
        keyId: checkout.keyId,
        subscriptionId: checkout.subscriptionId,
        description: `${plan.name} plan - ${checkout.clinicName}`,
        prefill: checkout.prefill,
      })
      if (result) {
        setBilling(await confirmCheckout(result))
        setNotice(
          checkout.startAt
            ? `You're subscribed to the ${plan.name} plan. The first charge is on ${formatDate(checkout.startAt)}.`
            : `You're subscribed to the ${plan.name} plan.`,
        )
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusyPlan(null)
    }
  }

  const cancelMutation = useMutation({
    mutationFn: cancelSubscription,
    onSuccess: (next) => {
      setBilling(next)
      setConfirmCancel(false)
      setNotice('Your subscription is cancelled. Nothing more will be charged.')
    },
    onError: (err) => {
      setConfirmCancel(false)
      setError(errorMessage(err))
    },
  })

  if (isLoading) return <LoadingState label="Loading subscription…" />
  if (isError) return <ErrorState onRetry={refetch} />

  const canCancel =
    Boolean(billing.scheduled) ||
    (billing.subscription &&
      !billing.subscription.cancelAtCycleEnd &&
      ['active', 'past_due'].includes(billing.status))

  return (
    <div className="mx-auto max-w-4xl">
      <BackButton />
      <h1 className="mb-6 flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-gray-100">
        <CreditCard size={22} aria-hidden="true" />
        Subscription
      </h1>

      {!billing.enforced ? (
        <p className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
          Clinix is free during early access - there is nothing to pay yet, and
          no limits.
        </p>
      ) : (
        <div className="space-y-6">
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
            >
              <AlertTriangle
                size={16}
                className="mt-0.5 shrink-0"
                aria-hidden="true"
              />
              {error}
            </div>
          )}
          {notice && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950/40 dark:text-green-300"
            >
              <CheckCircle2
                size={16}
                className="mt-0.5 shrink-0"
                aria-hidden="true"
              />
              {notice}
            </div>
          )}

          <StatusCard billing={billing} />

          <section aria-labelledby="plans-heading">
            <h2
              id="plans-heading"
              className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100"
            >
              Plans
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
              {billing.plans.map((plan) => {
                const action = planAction(billing, plan)
                const current =
                  billing.plan === plan.code &&
                  ['active', 'manual', 'cancelling', 'past_due'].includes(
                    billing.status,
                  )
                return (
                  <div
                    key={plan.code}
                    className={`flex flex-col rounded-xl border bg-white p-5 dark:bg-gray-900 ${
                      current
                        ? 'border-blue-600 ring-1 ring-blue-600 dark:border-blue-500 dark:ring-blue-500'
                        : 'border-gray-200 dark:border-gray-800'
                    }`}
                  >
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                      {plan.name}
                    </h3>
                    <p className="mt-2">
                      <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                        {rupees(plan.pricePaise)}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        /month
                      </span>
                    </p>
                    <ul className="mt-4 flex-1 space-y-2">
                      <PlanFeature ok>
                        {plan.maxDoctors === 1
                          ? '1 doctor'
                          : `Up to ${plan.maxDoctors} doctors`}
                      </PlanFeature>
                      <PlanFeature ok>
                        {plan.maxStaff == null
                          ? 'Unlimited staff'
                          : `${plan.maxStaff} staff accounts besides doctors`}
                      </PlanFeature>
                      <PlanFeature ok>Every core feature</PlanFeature>
                      <PlanFeature ok={plan.messaging}>
                        WhatsApp and email notifications
                      </PlanFeature>
                    </ul>
                    <Button
                      className="mt-5 w-full"
                      variant={action.disabled ? 'secondary' : 'primary'}
                      disabled={action.disabled || Boolean(busyPlan)}
                      loading={busyPlan === plan.code}
                      onClick={() => choose(plan)}
                    >
                      {action.label}
                    </Button>
                  </div>
                )
              })}
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Prices are per month. Payments are handled by Razorpay (card or
              UPI Autopay) - Clinix never sees your card or bank details.
            </p>
            {canCancel && (
              <Button variant="ghost" onClick={() => setConfirmCancel(true)}>
                Cancel subscription
              </Button>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel subscription?"
        description={
          billing?.status === 'active' && billing.paidUntil
            ? `Nothing more will be charged. You keep full access until ${formatDate(billing.paidUntil)}; after that, and a short grace period, the clinic becomes read-only until you subscribe again.`
            : 'Nothing will be charged. You can subscribe again any time.'
        }
        confirmLabel="Cancel subscription"
        loading={cancelMutation.isPending}
        onConfirm={() => cancelMutation.mutate()}
        onCancel={() => setConfirmCancel(false)}
      />
    </div>
  )
}
