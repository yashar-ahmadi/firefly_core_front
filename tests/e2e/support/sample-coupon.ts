import { expect, type Page } from '@playwright/test'
import type { Cart } from '@/lib/api/types/cart'
import { cartWrite } from './cart-write'

// The cart page's coupon box with the sample data's `TEA30` (30% off Ahmad Tea, no spend or use
// limit; cart-address.md §9). The sample coupons are valid until 2031–2032 and the backend's own
// fixture test fails a year before any of their dates runs out (backend change log, F-11), so
// the code is applied directly: anything but a 200 is a failure of the journey, not a fallback.
// The apply goes through the dev-lock guard (support/cart-write.ts).

const BOX = 'کد تخفیف دارید؟'

/** The sample coupon the guest's journey applies. */
export const SAMPLE_COUPON = 'TEA30'

/** Applies `SAMPLE_COUPON` on the cart page; the API's cart with it. */
export async function applySampleCoupon(page: Page): Promise<Cart> {
  await page.getByLabel(BOX).fill(SAMPLE_COUPON)
  const answer = await cartWrite(
    page,
    { method: 'POST', path: 'cart/coupon/apply/', label: `coupon ${SAMPLE_COUPON}` },
    () => page.getByRole('button', { name: 'اعمال کد' }).click(),
  )
  expect(answer.ok(), `coupon ${SAMPLE_COUPON}`).toBe(true)
  return ((await answer.json()) as { data: Cart }).data
}
