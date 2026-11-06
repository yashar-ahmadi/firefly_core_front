import { describe, expect, it } from 'vitest'
import { linkRefusalOf, REFUSAL_COPY } from '@/features/payment/link-refusal'
import { ApiError } from '@/lib/api/errors'
import restOnDelivery from '../../fixtures/order-pay-link-rest-on-delivery.json'

// Why the payment link's page does not open (order digest §3.1.9, §8.2), after the backend's
// 2026-11-05 round: an order the link takes no more money for is told so whatever its deadline
// (BACKEND-ISSUES M-5), and one whose online share has all arrived while the courier still
// collects the rest has its own code, its sentence naming the figure (M-6, live body). Only the
// 410 sends the shopper to support.

const refused = (status: number, code: string, detail = 'جمله\u{0654} سرور.') =>
  new ApiError({ status, code, detail })

describe('linkRefusalOf', () => {
  it('order_online_settled_rest_on_delivery (live): its own kind, the API’s sentence (its amount in it)', () => {
    const refusal = linkRefusalOf(ApiError.fromBody(409, restOnDelivery))
    expect(refusal).toEqual({
      kind: 'rest_on_delivery',
      detail:
        'مبلغ آنلاین این سفارش پرداخت شده است؛ ۱۵٬۰۰۰ تومان باقی\u{200C}مانده هنگام تحویل دریافت می\u{200C}شود.',
      retryAfter: null,
    })
    expect(REFUSAL_COPY.rest_on_delivery.detail).toBe(true)
  })

  it.each([
    ['order_already_settled', 409, 'settled'],
    ['order_collected_on_delivery', 409, 'collected'],
    ['order_not_payable', 409, 'not_payable'],
    ['order_payment_link_expired', 410, 'expired'],
    ['order_payment_link_invalid', 404, 'invalid'],
  ])('%s: %s', (code, status, kind) => {
    expect(linkRefusalOf(refused(status, code)).kind).toBe(kind)
  })
})

describe('what the page says', () => {
  it('«contact support» in the note only on the 410', () => {
    const support = /پشتیبانی/
    for (const [kind, copy] of Object.entries(REFUSAL_COPY)) {
      expect(copy.note ?? '', kind).toSatisfy((note: string) =>
        kind === 'expired' ? support.test(note) : !support.test(note),
      )
    }
  })

  it('an order paid online says nothing of a share at the door any more (that is M-6’s own code)', () => {
    expect(REFUSAL_COPY.settled.note).not.toMatch(/پیک|هنگام تحویل/)
  })
})
