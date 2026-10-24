import { expect } from '@playwright/test'
import { requestCartWrite } from '../support/cart-write'
import { kamranTest } from '../support/kamran-guard'
import { shiftTotal, watchShifts } from '../support/layout-shifts'

// A signed-in shopper's first visit keeps still (Plan 5 Task 8 fix round), measured as it
// happens: k.yazdi (ruling P4-R4; his guard, support/kamran-guard.ts, puts his cart, destination
// and shipping choice back exactly), one product in his cart, then /checkout/: the page posts his
// default address and the operator's default shipping by itself, then opens the review. Those
// choices used to open and close their steps in view, each moving the steps below (CLS 0.148 on
// a 412 px phone, 0.115 at 1440x900); they run behind the page's skeleton now, and the page is a
// screen tall, so its footer stays below the fold. In the `journeys` project (one login and one
// logout of his: support/session.ts counts them), at the project's 1440x900.

const VARIANT = 10123

kamranTest(
  'signed in: the first visit, its choices made for him, keeps still',
  async ({ page, kamran }) => {
    await requestCartWrite(
      kamran.request,
      { method: 'POST', path: 'cart/item/add/', label: 'add' },
      () =>
        kamran.request.post('/api/bff/cart/item/add/', {
          headers: { 'X-Requested-With': 'ff' },
          data: { variant: VARIANT, quantity: 1 },
        }),
    )
    await watchShifts(page)
    await page.goto('/checkout/')
    await expect(page.locator('section[data-step="review"]')).toHaveAttribute(
      'data-state',
      'active',
    )
    // The review's body in (its place-order button), and its own shift reported.
    await expect(
      page.getByRole('button', { name: /ثبت سفارش و پرداخت|ثبت و تأیید سفارش/ }),
    ).toBeVisible()
    const cls = await shiftTotal(page)
    console.log(`[cls] checkout signed-in first visit: ${cls.toFixed(4)}`)
    expect(cls).toBeLessThan(0.01)
  },
)
