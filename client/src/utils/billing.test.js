import { describe, it, expect } from 'vitest'
import { billingBanner, billingSummaryLine } from './billing.js'

const NOW = new Date('2026-10-20T10:00:00Z').getTime()
const DAY = 24 * 60 * 60 * 1000
const PLANS = [
  { code: 'starter', name: 'Starter' },
  { code: 'clinic', name: 'Clinic' },
]
const at = (days) => new Date(NOW + days * DAY).toISOString()

describe('subscription banner', () => {
  it('stays away with billing off, early in a trial, or once a plan is set to start', () => {
    expect(billingBanner({ enforced: false }, NOW)).toBeNull()
    expect(
      billingBanner(
        { enforced: true, status: 'trialing', trialEndsAt: at(10) },
        NOW,
      ),
    ).toBeNull()
    expect(
      billingBanner(
        {
          enforced: true,
          status: 'trialing',
          trialEndsAt: at(2),
          scheduled: { plan: 'clinic' },
        },
        NOW,
      ),
    ).toBeNull()
  })

  it('counts down the last week of the trial', () => {
    expect(
      billingBanner(
        { enforced: true, status: 'trialing', trialEndsAt: at(3) },
        NOW,
      ),
    ).toMatchObject({
      tone: 'info',
      text: 'Free trial: 3 days left.',
      action: 'Choose a plan',
    })
    expect(
      billingBanner(
        { enforced: true, status: 'trialing', trialEndsAt: at(0.2) },
        NOW,
      ).text,
    ).toBe('Free trial: 1 day left.')
  })

  it('warns after a failed payment, with the read-only date', () => {
    const banner = billingBanner(
      {
        enforced: true,
        status: 'past_due',
        access: 'grace',
        readOnlyFrom: '2026-10-25T10:00:00Z',
      },
      NOW,
    )
    expect(banner.tone).toBe('warning')
    expect(banner.text).toMatch(/payment failed.*25 Oct 2026/)
  })

  it('says the trial ended, or the subscription ended', () => {
    expect(
      billingBanner(
        {
          enforced: true,
          status: 'expired',
          access: 'grace',
          readOnlyFrom: at(5),
          plan: null,
        },
        NOW,
      ).text,
    ).toMatch(/^Your free trial has ended/)
    expect(
      billingBanner(
        {
          enforced: true,
          status: 'expired',
          access: 'grace',
          readOnlyFrom: at(5),
          plan: 'clinic',
        },
        NOW,
      ).text,
    ).toMatch(/^Your subscription has ended/)
  })

  it('is red once the clinic is read-only', () => {
    expect(
      billingBanner(
        { enforced: true, status: 'expired', access: 'readonly' },
        NOW,
      ),
    ).toMatchObject({ tone: 'danger', action: 'Renew now' })
  })
})

describe('subscription summary line', () => {
  it('reads naturally for every state', () => {
    expect(billingSummaryLine({ enforced: false }, NOW)).toBe(
      'Free during early access',
    )
    expect(
      billingSummaryLine(
        { enforced: true, status: 'trialing', trialEndsAt: at(1) },
        NOW,
      ),
    ).toBe('Free trial, 1 day left')
    expect(
      billingSummaryLine(
        {
          enforced: true,
          status: 'active',
          plan: 'clinic',
          plans: PLANS,
          paidUntil: '2026-11-05T00:00:00Z',
        },
        NOW,
      ),
    ).toBe('Clinic plan, renews 5 Nov 2026')
    expect(
      billingSummaryLine(
        {
          enforced: true,
          status: 'past_due',
          access: 'readonly',
          plan: 'clinic',
          plans: PLANS,
        },
        NOW,
      ),
    ).toBe('Payment failed - read-only')
    expect(
      billingSummaryLine(
        { enforced: true, status: 'expired', access: 'grace' },
        NOW,
      ),
    ).toBe('Not subscribed')
  })
})
