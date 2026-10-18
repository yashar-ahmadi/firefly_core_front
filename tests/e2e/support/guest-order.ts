import { expect, type Page } from '@playwright/test'
import type { Cart } from '@/lib/api/types/cart'
import type { OrderPlacementResult } from '@/lib/api/types/order'
import { seedGuestCart } from './checkout-states'

// A guest order left awaiting payment, placed through the BFF in this context (Plan 4 Task 4;
// ruling P4-R4: a guest, never a demo account): this context's cart (a product, Tehran, the
// operator's default shipping: `seedGuestCart`, the cart writes through the dev-lock guard), then
// `POST order/place/` with a receiver whose mobile is new each run (the unpaid-orders ceiling
// counts per mobile) and the cart's total. No payment intent. The caller cancels the order
// (`cancelGuestOrder`, also its guard when the test fails earlier). The link token is a
// credential: never printed.

const BFF = { 'X-Requested-With': 'ff' }

export interface GuestOrderHandle {
  token: string
  orderCode: string
}

/** A mobile of this run: 0912 and 7 digits from the clock. */
export const runMobile = () => `0912${String(Date.now()).slice(-7)}`

export async function placeGuestOrder(page: Page): Promise<GuestOrderHandle> {
  await seedGuestCart(page)
  const cart = await page.request.get('/api/bff/cart/', { headers: BFF })
  expect(cart.ok(), 'cart/').toBe(true)
  const { total } = ((await cart.json()) as { data: Cart }).data
  const placed = await page.request.post('/api/bff/order/place/', {
    headers: { ...BFF, 'Idempotency-Key': crypto.randomUUID() },
    data: {
      receiver: {
        first_name: 'آزمون',
        last_name: 'لینک پرداخت',
        mobile: runMobile(),
        address: 'خیابان آزمون، کوچه\u{0654} یک',
        postal_code: '1234567890',
      },
      expected_total: total,
    },
  })
  expect(placed.status(), 'a guest order placed').toBe(201)
  const order = ((await placed.json()) as { data: OrderPlacementResult }).data
  const token = new URL(order.payment_url!).pathname.split('/').filter(Boolean).at(-1)!
  return { token, orderCode: order.order_code }
}

/**
 * The order cancelled through its link while it awaits payment (order digest §3.1.10); true when
 * it is cancelled now or was already (its link then answers 404). Never throws.
 */
export async function cancelGuestOrder(page: Page, token: string): Promise<boolean> {
  try {
    const response = await page.request.post(`/api/bff/order/pay/${token}/cancel/`, {
      headers: BFF,
      data: {},
    })
    if (response.ok() || response.status() === 404) return true
    console.warn(`[guest-order] the order was not cancelled: ${response.status()}`)
    return false
  } catch {
    console.warn('[guest-order] the order could not be cancelled (no answer)')
    return false
  }
}
