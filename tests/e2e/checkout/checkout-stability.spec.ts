import { expect, test } from '@playwright/test'
import { checkoutReached, leaveCheckout, prepareCheckout } from '../support/checkout-states'
import { shiftTotal, watchShifts } from '../support/layout-shifts'

// The checkout's layout stays put while its open step's body arrives (Plan 5 Task 8: Lighthouse
// measured a CLS of 0.46 on a guest's /checkout/). Each step's body is its own chunk
// (lazy-steps.tsx) shown over a skeleton meanwhile; a skeleton far shorter than its body pushed
// the steps below it down by a page when the body came. Measured as the browser does
// (`layout-shift` entries without recent input), the guest's receiver step and the review, on a
// phone and a desktop. Writes: this context's own guest cart, cleared after.

test.describe('the checkout keeps still while a step’s body arrives', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name === 'tablet', 'a phone and a desktop')
  })

  for (const state of ['guest', 'guest-review'] as const) {
    test(`${state === 'guest' ? 'the receiver step' : 'the review'}: CLS under 0.1`, async ({
      page,
    }, testInfo) => {
      await watchShifts(page)
      await prepareCheckout(page, state)
      try {
        await page.goto('/checkout/')
        await checkoutReached(page, state, testInfo.project.name)
        const body = page.locator(
          `section[data-step="${state === 'guest' ? 'receiver' : 'review'}"]`,
        )
        await expect(body.locator('form, button[type="submit"]').first()).toBeVisible()
        const cls = await shiftTotal(page)
        console.log(`[cls] checkout ${state} ${testInfo.project.name}: ${cls.toFixed(3)}`)
        expect(cls).toBeLessThan(0.1)
      } finally {
        await leaveCheckout(page, state)
      }
    })
  }
})
