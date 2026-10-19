import { expect, test } from '@playwright/test'
import { checkoutReached, leaveCheckout, prepareCheckout } from '../support/checkout-states'
import { watchErrors } from '../support/watch-errors'

// The operator's message slots against the dev backend (Plan 5 Task 5): live, only `terms` and
// `return-policy` exist (one warning each), shown as dialog links beside the review's terms
// checkbox; `home`, `product`, `cart` and `checkout` do not, so those pages show nothing of a
// slot. Read-only but for the guest cart the review needs: one product, Tehran and the default
// shipping (support/checkout-states.ts, through the cart-write guard), cleared afterwards: four
// cart writes a project.

test.describe('message slots', () => {
  test('the review’s «مطالعهٔ قوانین» opens the live `terms` content, then gives the focus back', async ({
    page,
  }, info) => {
    const errors = watchErrors(page)
    await prepareCheckout(page, 'guest-review')
    try {
      await page.goto('/checkout/')
      await checkoutReached(page, 'guest-review', info.project.name)
      const review = page.locator('section[data-step="review"]')
      const terms = review.getByRole('button', { name: 'مطالعهٔ قوانین' })
      await expect(terms).toBeVisible()
      // Beside the terms' sentence: after its checkbox, before the legal age's.
      const boxes = review.getByRole('checkbox')
      await expect(boxes.first()).toBeVisible()
      expect(
        await terms.evaluate(
          (button, box) => {
            const position = box!.compareDocumentPosition(button)
            return (position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
          },
          await boxes.first().elementHandle(),
        ),
      ).toBe(true)

      await terms.click()
      const dialog = page.getByRole('dialog', { name: 'قوانین و مقررات' })
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole('note')).toContainText('کالاهای غیرقابل مرجوع')
      await expect(page.locator(':focus')).toHaveAccessibleName('بستن')
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      await expect(terms).toBeFocused()
      // Reading is not agreeing: the box is still to be ticked.
      await expect(boxes.first()).not.toBeChecked()

      await review.getByRole('button', { name: 'رویهٔ بازگرداندن کالا' }).click()
      const returns = page.getByRole('dialog', { name: 'رویه بازگرداندن کالا' })
      await expect(returns.getByRole('note')).toContainText('هزینه ارسال مرجوعی')
      await returns.getByRole('button', { name: 'بستن' }).last().click()
      await expect(returns).toBeHidden()
      // No `checkout` slot in the dev data: nothing above the steps.
      await expect(page.locator('[data-slot="checkout"]')).toHaveCount(0)
    } finally {
      await leaveCheckout(page, 'guest-review')
    }
    expect(errors).toEqual([])
  })

  test('pages whose slot the dev data lacks show nothing of it', async ({ page }) => {
    const errors = watchErrors(page)
    for (const path of ['/', '/product/samsung-galaxy-s25-ultra/', '/cart/']) {
      const response = await page.goto(path)
      expect(response?.status(), path).toBe(200)
      await expect(page.getByRole('heading', { level: 1 })).toBeAttached()
      await expect(page.locator('[data-slot]'), path).toHaveCount(0)
    }
    expect(errors).toEqual([])
  })
})
