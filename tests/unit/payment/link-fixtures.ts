import type { OrderPaymentLink } from '@/lib/api/types/order'
import type { OpenAttempt } from '@/lib/api/types/payment'
import awaiting from '../../fixtures/order-pay-link-awaiting.json'
import openCard from '../../fixtures/order-pay-link-open-card.json'
import { handoff, PAYMENT_UUID } from './fixtures'

// The payment link's page as the dev API answered it (2026-10-18, a guest order placed for the
// capture and cancelled right after through its link): order 1411635340 awaiting payment
// (1,049,000 online, nothing at the door), then with an open card-transfer attempt. The other
// attempt shapes (a bank handoff, an expired handoff, a verification) cannot be had in dev (no
// gateway works there): they follow the digest's `OpenAttempt` (§2, §5.9).

const copy = <T>(value: unknown): T => structuredClone(value) as T

export const LINK_DEADLINE = new Date(Date.now() + 48 * 3_600_000).toISOString()

/** The live link page: awaiting payment, no attempt (its deadline moved two days ahead). */
export const payLink = (changes: Partial<OrderPaymentLink> = {}): OrderPaymentLink => ({
  ...copy<{ data: OrderPaymentLink }>(awaiting).data,
  expires_at: LINK_DEADLINE,
  ...changes,
})

/** The live card-transfer attempt (its uuid the tests' own). */
export const cardAttempt = (changes: Partial<OpenAttempt> = {}): OpenAttempt => ({
  ...copy<{ data: { open_attempt: OpenAttempt } }>(openCard).data.open_attempt,
  ...changes,
})

/** A bank attempt whose handoff is still valid (digest §5.9 row 1). */
export const bankAttempt = (changes: Partial<OpenAttempt> = {}): OpenAttempt => ({
  payment: PAYMENT_UUID,
  method: 'bank_gateway',
  status: 'pending',
  amount: 1_049_000,
  expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
  handoff: handoff(),
  destination_cards: [],
  ...changes,
})

/** Row 2: the handoff expired, the attempt closes at `expires_at`. */
export const expiredAttempt = () => bankAttempt({ handoff: null })

/** Row 3: the bank answered, the verification runs (`expires_at` null). */
export const verifyingAttempt = () => bankAttempt({ handoff: null, expires_at: null })

/** Row 5: a receipt under review. */
export const reviewAttempt = () => cardAttempt({ status: 'awaiting_review' })
