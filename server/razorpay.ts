import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from './env'
import { HttpError } from './logic'

/**
 * Razorpay Standard Checkout.
 *   1. server creates an order          (POST /v1/orders)
 *   2. browser opens Razorpay Checkout  (UPI, cards, netbanking, wallets)
 *   3. server verifies the signature    (HMAC-SHA256 of order_id|payment_id)
 *   4. webhook `payment.captured` confirms it again if the tab was closed
 * Test keys (rzp_test_…) never move real money.
 */

const API = 'https://api.razorpay.com/v1'
const auth = () => 'Basic ' + Buffer.from(`${env.razorpay.keyId}:${env.razorpay.keySecret}`).toString('base64')

async function call<T>(path: string, body: Record<string, unknown>): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API}${path}`, { method: 'POST', headers: { Authorization: auth(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  } catch {
    throw new HttpError(502, 'Couldn’t reach the payment gateway. Try again.')
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: { description?: string } }
  if (!res.ok) {
    console.error('[ridesync] razorpay error', res.status, data.error?.description)
    throw new HttpError(502, data.error?.description || 'The payment gateway rejected the request.')
  }
  return data
}

export function createOrder(amountRupees: number, receipt: string, notes: Record<string, string>) {
  return call<{ id: string; amount: number; currency: string }>('/orders', { amount: Math.round(amountRupees * 100), currency: 'INR', receipt: receipt.slice(0, 40), notes })
}

export function refundPayment(paymentId: string, amountRupees: number, notes: Record<string, string>) {
  return call<{ id: string; status: string }>(`/payments/${paymentId}/refund`, { amount: Math.round(amountRupees * 100), speed: 'normal', notes })
}

const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string) {
  const expected = createHmac('sha256', env.razorpay.keySecret).update(`${orderId}|${paymentId}`).digest('hex')
  return safeEqual(expected, signature)
}

export function verifyWebhookSignature(rawBody: Buffer, signature: string) {
  if (!env.razorpay.webhookSecret) return false
  const expected = createHmac('sha256', env.razorpay.webhookSecret).update(rawBody).digest('hex')
  return safeEqual(expected, signature)
}
