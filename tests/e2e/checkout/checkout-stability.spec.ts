import { expect, test } from '@playwright/test'
import { checkoutReached, leaveCheckout, prepareCheckout } from '../support/checkout-states'
import { shiftTotal, watchShifts } from '../support/layout-shifts'
import { signedInTest } from '../support/session'

// The checkout's layout stays put while it arrives (Plan 5 Task 8: Lighthouse measured a CLS of
// 0.46 on a guest's /checkout/, the receiver form arriving over a far shorter skeleton). The page
// now arrives in one piece behind its own skeleton, a screen tall: the choices made for the
// shopper, then the open step's body (lazy-steps.tsx, `loadBody`). Measured as the browser does
// (`layout-shift` entries without recent input), the guest's receiver step and the review, on a
// phone and a desktop. Writes: this context's own guest cart, cleared after. Signed in: sara's
// cart as it is, the page's own writes refused (her default shipping cannot be chosen, so the
// step asks: its options arrived over the step's skeleton, CLS 0.24 on a phone); k.yazdi's real
// first visit: checkout-signed-in-stability.spec.ts.

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

signedInTest.describe('signed in, the shipping step asking (its default refused)', () => {
  signedInTest('the options arrive with the page: CLS under 0.01', async ({ page }, testInfo) => {
    signedInTest.skip(testInfo.project.name === 'tablet', 'a phone and a desktop')
    await watchShifts(page)
    await prepareCheckout(page, 'signed-in')
    await page.goto('/checkout/')
    await expect(page.getByText('یک روش ارسال انتخاب کنید.')).toBeVisible()
    const cls = await shiftTotal(page)
    console.log(
      `[cls] checkout signed-in, shipping asked ${testInfo.project.name}: ${cls.toFixed(3)}`,
    )
    expect(cls).toBeLessThan(0.01)
  })
})
