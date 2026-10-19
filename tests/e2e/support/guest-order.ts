import { expect, type Page } from '@playwright/test'
import type { Cart } from '@/lib/api/types/cart'
import type { OrderPlacementResult } from '@/lib/api/types/order'
import { seedGuestCart } from './checkout-states'

// A guest order left awaiting payment, placed through the BFF in this context (Plan 4 Task 4;
// ruling P4-R4: a guest, never a demo account): this context's cart (a product, Tehran, the
// operator's default shipping: `seedGuestCart`, the cart writes through the dev-lock guard), then
// `POST order/place/` with a receiver whose mobile is new each run (the unpaid-orders ceiling
// counts per mobile) and the cart's total. No payment intent. The caller hands the order to the
// `orders` guard (support/order-guard.ts), which cancels it through its link however the test
// ends. The link token is a credential: never printed.

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
