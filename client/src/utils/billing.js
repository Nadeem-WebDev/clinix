// Wording for the clinic's subscription state (GET /billing, see
// server/src/services/billing.service.js resolveBilling), shared by the
// Subscription page and the banner across the app.

const DAY_MS = 24 * 60 * 60 * 1000

export function formatDate(value) {
  return value
    ? new Date(value).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : ''
}

export function rupees(paise) {
  return `₹${(paise / 100).toLocaleString('en-IN')}`
}

export function daysUntil(value, now = Date.now()) {
  return Math.max(0, Math.ceil((new Date(value).getTime() - now) / DAY_MS))
}

export function planName(billing, code) {
  return billing?.plans?.find((p) => p.code === code)?.name ?? code
}

// The banner shown above every page, or null. `tone` picks the colour;
// `action` is the owner's link text (other staff are told to ask the owner).
export function billingBanner(billing, now = Date.now()) {
  if (!billing?.enforced) return null
  const ended =
    billing.subscription || billing.plan
      ? 'Your subscription has ended'
      : 'Your free trial has ended'

  if (billing.access === 'readonly') {
    return {
      tone: 'danger',
      text: "Your clinic is read-only because the subscription isn't paid. Records can still be viewed and printed, but nothing new can be added.",
      action: 'Renew now',
    }
  }
  if (billing.status === 'past_due') {
    return {
      tone: 'warning',
      text: `The last subscription payment failed. Razorpay will retry it; if it isn't paid by ${formatDate(billing.readOnlyFrom)}, the clinic becomes read-only.`,
      action: 'Pay now',
    }
  }
  if (billing.status === 'expired') {
    return {
      tone: 'warning',
      text: `${ended}. Choose a plan by ${formatDate(billing.readOnlyFrom)} to keep adding records.`,
      action: 'Choose a plan',
    }
  }
  if (billing.scheduled) return null
  if (
    billing.status === 'trialing' &&
    daysUntil(billing.trialEndsAt, now) <= 7
  ) {
    const days = daysUntil(billing.trialEndsAt, now)
    return {
      tone: 'info',
      text: `Free trial: ${days === 0 ? 'ends today' : `${days} ${days === 1 ? 'day' : 'days'} left`}.`,
      action: 'Choose a plan',
    }
  }
  if (
    billing.status === 'cancelling' &&
    billing.paidUntil &&
    daysUntil(billing.paidUntil, now) <= 7
  ) {
    return {
      tone: 'info',
      text: `Your subscription ends on ${formatDate(billing.paidUntil)}.`,
      action: 'Renew',
    }
  }
  return null
}

// One line for the Settings card and the platform panel.
export function billingSummaryLine(billing, now = Date.now()) {
  if (!billing?.enforced) return 'Free during early access'
  const plan = billing.plan ? planName(billing, billing.plan) : null
  switch (billing.status) {
    case 'trialing': {
      const days = daysUntil(billing.trialEndsAt, now)
      return `Free trial, ${days} ${days === 1 ? 'day' : 'days'} left`
    }
    case 'active':
      return billing.paidUntil
        ? `${plan} plan, renews ${formatDate(billing.paidUntil)}`
        : `${plan} plan`
    case 'cancelling':
      return `${plan} plan, ends ${formatDate(billing.paidUntil)}`
    case 'manual':
      return `${plan} plan, paid until ${formatDate(billing.paidUntil)}`
    case 'past_due':
      return billing.access === 'readonly'
        ? 'Payment failed - read-only'
        : 'Payment failed'
    default:
      return billing.access === 'readonly'
        ? 'Not subscribed - read-only'
        : 'Not subscribed'
  }
}
