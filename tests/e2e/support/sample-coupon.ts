import type { Page } from '@playwright/test'
import type { Cart } from '@/lib/api/types/cart'
import { cartWrite } from './cart-write'
import { couponsToTry, firstTaken, type CouponChoice } from './coupon-choice'
import { forgiveFailure } from './watch-errors'

// The cart page's coupon box with the sample codes in turn (support/coupon-choice.ts; Plan 4
// Task 10 fix round): each apply goes through the dev-lock guard and is read whether taken (200:
// the API's cart) or refused (400: the API's error code, the browser's console error for it
// forgiven); a refused code stays in the field, and the next one replaces it.

const BOX = 'کد تخفیف دارید؟'

export async function applySampleCoupon(page: Page): Promise<CouponChoice<Cart>> {
  return firstTaken<Cart>(couponsToTry(process.env.E2E_COUPONS), async (code) => {
    await page.getByLabel(BOX).fill(code)
    const answer = await cartWrite(
      page,
      { method: 'POST', path: 'cart/coupon/apply/', status: [200, 400], label: `coupon ${code}` },
      () => page.getByRole('button', { name: 'اعمال کد' }).click(),
    )
    const { data } = (await answer.json()) as { data: Cart & { errors?: { code: string }[] } }
    if (answer.ok()) return { code, taken: data }
    forgiveFailure(page, answer.url(), answer.status())
    return { code, refusal: data.errors?.[0]?.code ?? `status ${answer.status()}` }
  })
}
