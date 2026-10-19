import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Subscription from './Subscription.jsx'
import * as billingApi from '../api/billing.js'
import * as checkout from '../utils/razorpayCheckout.js'
import { renderWithProviders } from '../test/test-utils.jsx'

vi.mock('../api/billing.js')
vi.mock('../utils/razorpayCheckout.js')

const DAY = 24 * 60 * 60 * 1000
const PLANS = [
  {
    code: 'starter',
    name: 'Starter',
    pricePaise: 49900,
    maxDoctors: 1,
    maxStaff: 2,
    messaging: false,
    available: true,
  },
  {
    code: 'clinic',
    name: 'Clinic',
    pricePaise: 99900,
    maxDoctors: 3,
    maxStaff: null,
    messaging: true,
    available: true,
  },
  {
    code: 'multi',
    name: 'Multi-doctor',
    pricePaise: 199900,
    maxDoctors: 5,
    maxStaff: null,
    messaging: true,
    available: false,
  },
]
const trial = (overrides = {}) => ({
  enforced: true,
  status: 'trialing',
  access: 'full',
  plan: null,
  trialEndsAt: new Date(Date.now() + 6.5 * DAY).toISOString(),
  readOnlyFrom: null,
  scheduled: null,
  subscription: null,
  limits: { maxDoctors: 5, maxStaff: null, messaging: true },
  usage: { doctors: 1, staff: 2 },
  plans: PLANS,
  ...overrides,
})
const card = (name) =>
  screen.getByRole('heading', { name, level: 3 }).closest('div')

describe('Subscription page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    billingApi.getBilling.mockResolvedValue(trial())
  })

  it('shows the trial, the usage and the three plans', async () => {
    renderWithProviders(<Subscription />)

    expect(
      await screen.findByRole('heading', { name: 'Free trial - 7 days left' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/you won't be charged until the trial ends/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Using: 1 doctor of 5 · 2 staff'),
    ).toBeInTheDocument()
    expect(within(card('Starter')).getByText('₹499')).toBeInTheDocument()
    expect(
      within(card('Starter')).getByText(/whatsapp and email notifications/i),
    ).toHaveTextContent('(not included)')
    expect(
      within(card('Clinic')).getByRole('button', { name: 'Choose Clinic' }),
    ).toBeEnabled()
    expect(
      within(card('Multi-doctor')).getByRole('button', {
        name: 'Not available yet',
      }),
    ).toBeDisabled()
  })

  it('subscribes through Razorpay and confirms with the server', async () => {
    billingApi.startSubscription.mockResolvedValue({
      subscriptionId: 'sub_1',
      keyId: 'rzp_test_key',
      plan: 'clinic',
      startAt: '2026-10-27T10:00:00.000Z',
      clinicName: 'Sunrise Clinic',
      prefill: { name: 'Rohan', email: 'rohan@sunrise.test' },
    })
    const paid = {
      razorpay_payment_id: 'pay_1',
      razorpay_subscription_id: 'sub_1',
      razorpay_signature: 'sig',
    }
    checkout.openSubscriptionCheckout.mockResolvedValue(paid)
    billingApi.confirmCheckout.mockResolvedValue(
      trial({
        scheduled: {
          plan: 'clinic',
          status: 'authenticated',
          startAt: '2026-10-27T10:00:00.000Z',
        },
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<Subscription />)

    await user.click(
      await screen.findByRole('button', { name: 'Choose Clinic' }),
    )

    expect(billingApi.startSubscription).toHaveBeenCalledWith('clinic')
    expect(checkout.openSubscriptionCheckout).toHaveBeenCalledWith({
      keyId: 'rzp_test_key',
      subscriptionId: 'sub_1',
      description: 'Clinic plan - Sunrise Clinic',
      prefill: { name: 'Rohan', email: 'rohan@sunrise.test' },
    })
    await waitFor(() =>
      expect(billingApi.confirmCheckout).toHaveBeenCalledWith(paid),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(
      "You're subscribed to the Clinic plan. The first charge is on 27 Oct 2026.",
    )
    expect(
      screen.getByRole('heading', { name: /free trial/i }).nextSibling,
    ).toHaveTextContent('The Clinic plan starts on 27 Oct 2026.')
    expect(
      within(card('Clinic')).getByRole('button', {
        name: 'Starts 27 Oct 2026',
      }),
    ).toBeDisabled()
  })

  it('leaves everything as it was when the payment window is closed', async () => {
    billingApi.startSubscription.mockResolvedValue({
      subscriptionId: 'sub_1',
      keyId: 'k',
      plan: 'starter',
      clinicName: 'C',
      prefill: {},
    })
    checkout.openSubscriptionCheckout.mockResolvedValue(null)
    const user = userEvent.setup()
    renderWithProviders(<Subscription />)

    await user.click(
      await screen.findByRole('button', { name: 'Choose Starter' }),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Choose Starter' }),
      ).toBeEnabled(),
    )
    expect(billingApi.confirmCheckout).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows why a payment failed', async () => {
    billingApi.startSubscription.mockResolvedValue({
      subscriptionId: 'sub_1',
      keyId: 'k',
      plan: 'starter',
      clinicName: 'C',
      prefill: {},
    })
    checkout.openSubscriptionCheckout.mockRejectedValue(
      new Error('Your bank declined the payment.'),
    )
    const user = userEvent.setup()
    renderWithProviders(<Subscription />)

    await user.click(
      await screen.findByRole('button', { name: 'Choose Starter' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your bank declined the payment.',
    )
  })

  it("won't offer a plan the clinic has outgrown", async () => {
    billingApi.getBilling.mockResolvedValue(
      trial({ usage: { doctors: 2, staff: 1 } }),
    )
    renderWithProviders(<Subscription />)
    expect(
      await screen.findByRole('button', { name: 'Too many doctors (2)' }),
    ).toBeDisabled()
  })

  it('cancels at the end of the paid month, after asking', async () => {
    const active = trial({
      status: 'active',
      plan: 'clinic',
      paidUntil: '2026-11-05T00:00:00.000Z',
      subscription: {
        id: 'sub_1',
        plan: 'clinic',
        status: 'active',
        cancelAtCycleEnd: false,
      },
    })
    billingApi.getBilling.mockResolvedValue(active)
    billingApi.cancelSubscription.mockResolvedValue({
      ...active,
      status: 'cancelling',
      subscription: { ...active.subscription, cancelAtCycleEnd: true },
    })
    const user = userEvent.setup()
    renderWithProviders(<Subscription />)

    expect(
      await screen.findByRole('heading', { name: 'Clinic plan' }),
    ).toBeInTheDocument()
    expect(
      within(card('Clinic')).getByRole('button', { name: 'Current plan' }),
    ).toBeDisabled()
    expect(
      within(card('Starter')).getByRole('button', {
        name: 'Switch to Starter',
      }),
    ).toBeEnabled()

    await user.click(
      screen.getByRole('button', { name: 'Cancel subscription' }),
    )
    const dialog = screen.getByRole('dialog', { name: 'Cancel subscription?' })
    expect(dialog).toHaveTextContent('You keep full access until 5 Nov 2026')
    await user.click(
      within(dialog).getByRole('button', { name: 'Cancel subscription' }),
    )

    await waitFor(() =>
      expect(billingApi.cancelSubscription).toHaveBeenCalled(),
    )
    expect(
      await screen.findByRole('heading', { name: 'Clinic plan - cancelled' }),
    ).toBeInTheDocument()
  })

  it('says there is nothing to pay while billing is off', async () => {
    billingApi.getBilling.mockResolvedValue({ enforced: false, status: 'free' })
    renderWithProviders(<Subscription />)
    expect(
      await screen.findByText(/free during early access/i),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /choose/i }),
    ).not.toBeInTheDocument()
  })
})
