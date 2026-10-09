type OnlineOrder = { keyId: string; orderId: string; amount: number; currency: string; description: string; prefill: Record<string, string> }

/** Razorpay Standard Checkout in the browser (loaded on first use). */
type RazorpayCtor = new (opts: Record<string, unknown>) => { open: () => void; on: (ev: string, fn: (r: { error?: { description?: string } }) => void) => void }
declare global {
  interface Window {
    Razorpay?: RazorpayCtor
  }
}

let checkoutJs: Promise<void> | null = null
export function loadCheckout() {
  if (window.Razorpay) return Promise.resolve()
  checkoutJs ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = () => resolve()
    s.onerror = () => {
      checkoutJs = null
      reject(new Error('Couldn’t load the payment window. Check your connection.'))
    }
    document.body.appendChild(s)
  })
  return checkoutJs
}

export type CheckoutResult = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }

/** Opens Razorpay. Resolves with the signed result, resolves null if closed, rejects if the payment fails. */
export async function openCheckout(order: OnlineOrder): Promise<CheckoutResult | null> {
  await loadCheckout()
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      name: 'RideSync AI',
      description: order.description,
      image: `${window.location.origin}/apple-touch-icon.png`,
      prefill: order.prefill,
      theme: { color: '#5038E6' },
      handler: (r: CheckoutResult) => resolve(r),
      modal: { ondismiss: () => resolve(null) },
    })
    rzp.on('payment.failed', (r) => reject(new Error(`Payment failed: ${r.error?.description ?? 'please try again'}. You haven’t been charged.`)))
    rzp.open()
  })
}
