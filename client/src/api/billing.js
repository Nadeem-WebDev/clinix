import apiClient from './client.js'

// The clinic's Clinix subscription (Settings -> Subscription), not patient
// bills - those are in invoices.js.
export async function getBilling() {
  const { data } = await apiClient.get('/billing')
  return data.data.billing
}

export async function startSubscription(plan) {
  const { data } = await apiClient.post('/billing/subscribe', { plan })
  return data.data.checkout
}

export async function confirmCheckout(payload) {
  const { data } = await apiClient.post('/billing/confirm', payload)
  return data.data.billing
}

export async function cancelSubscription() {
  const { data } = await apiClient.post('/billing/cancel')
  return data.data.billing
}
