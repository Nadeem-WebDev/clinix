// Razorpay's checkout pop-up, loaded only when an owner actually subscribes
// - nobody else downloads Razorpay's script. The server's CSP allows
// checkout.razorpay.com for exactly this (server/src/app.js).
const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js'
let loading = null

export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay)
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = CHECKOUT_SRC
      script.async = true
      script.onload = () => resolve(window.Razorpay)
      script.onerror = () => {
        loading = null
        script.remove()
        reject(
          new Error(
            'The payment window could not be loaded. Check your internet connection and try again.',
          ),
        )
      }
      document.body.appendChild(script)
    })
  }
  return loading
}

// Opens checkout for a subscription the server created. Resolves with
// Razorpay's { razorpay_payment_id, razorpay_subscription_id,
// razorpay_signature } once the payment is authorised, or with null if the
// pop-up was closed; rejects if the payment failed.
export async function openSubscriptionCheckout({
  keyId,
  subscriptionId,
  description,
  prefill,
}) {
  const Razorpay = await loadRazorpay()
  return new Promise((resolve, reject) => {
    const checkout = new Razorpay({
      key: keyId,
      subscription_id: subscriptionId,
      name: 'Clinix',
      description,
      prefill,
      theme: { color: '#2563eb' },
      handler: resolve,
      modal: { ondismiss: () => resolve(null) },
    })
    checkout.on('payment.failed', (response) => {
      reject(
        new Error(
          response?.error?.description || 'The payment did not go through.',
        ),
      )
    })
    checkout.open()
  })
}
