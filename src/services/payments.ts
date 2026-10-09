import type { PaymentMethodKind } from '@/lib/types'

/**
 * Payment gateway boundary.
 *
 * The app only talks to `PaymentGateway`. This build ships the sandbox
 * gateway, which never moves money and is labelled "Test mode" everywhere it
 * is used. To go live, implement the same interface against a real provider:
 *
 *   1. Backend creates an order   (e.g. Razorpay POST /v1/orders)
 *   2. Client opens the checkout  (Razorpay Checkout / UPI intent)
 *   3. Backend verifies the signature + webhook, then confirms the booking
 *
 * Booking confirmation must come from step 3, never from the client alone.
 */

export type ChargeDetails =
  | { method: 'upi'; upiId: string }
  | { method: 'gpay' | 'phonepe' | 'paytm' }
  | { method: 'card'; number: string; expiry: string; cvv: string; name: string }
  | { method: 'wallet'; balance: number }

export type ChargeRequest = { amount: number; reference: string; details: ChargeDetails }

export type ChargeResult = { ok: true; reference: string } | { ok: false; reason: string; retryable: boolean }

export interface PaymentGateway {
  readonly id: string
  readonly testMode: boolean
  charge(req: ChargeRequest): Promise<ChargeResult>
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Test values that simulate failures, shown to users in the test-mode hint. */
export const SANDBOX_FAILURE_UPI = 'fail@test'
export const SANDBOX_FAILURE_CARD = '4000 0000 0000 0002'
export const SANDBOX_SUCCESS_CARD = '4111 1111 1111 1111'

export const sandboxGateway: PaymentGateway = {
  id: 'sandbox',
  testMode: true,
  async charge({ amount, details }) {
    await wait(1300 + Math.random() * 700)
    const code = Math.floor(10000 + Math.random() * 89999)
    switch (details.method) {
      case 'upi':
        if (details.upiId.toLowerCase().includes('fail'))
          return { ok: false, reason: 'Your bank declined this UPI payment.', retryable: true }
        return { ok: true, reference: `TEST-UPI-${code}` }
      case 'card':
        if (details.number.replace(/\s/g, '') === SANDBOX_FAILURE_CARD.replace(/\s/g, ''))
          return { ok: false, reason: 'Card declined by issuing bank.', retryable: true }
        return { ok: true, reference: `TEST-CARD-${code}` }
      case 'wallet':
        if (details.balance < amount) return { ok: false, reason: 'Not enough balance in your RideSync Wallet.', retryable: false }
        return { ok: true, reference: `TEST-WAL-${code}` }
      default:
        return { ok: true, reference: `TEST-UPI-${code}` }
    }
  },
}

export const gateway: PaymentGateway = sandboxGateway

export const METHOD_LABEL: Record<PaymentMethodKind, string> = {
  upi: 'UPI ID',
  gpay: 'Google Pay',
  phonepe: 'PhonePe',
  paytm: 'Paytm',
  card: 'Credit / Debit card',
  wallet: 'RideSync Wallet',
}
