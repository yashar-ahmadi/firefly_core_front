import { expect, type Response } from '@playwright/test'
import type { Cart } from '@/lib/api/types/cart'
import { cartAnswer, cartWrite } from '../support/cart-write'
import { shellHydrated } from '../support/hydrated'
import { kamranTest } from '../support/kamran-guard'
import { chooseShipping, SHIPPING_SELECT } from '../support/shipping-choice'
import { watchErrors } from '../support/watch-errors'

// The signed-in checkout up to shipping (Plan 4 Task 2), in the `journeys` project only
// (playwright.config.ts): k.yazdi (ruling P4-R4), signed in by the `kamran` guard, which puts
// his cart (lines, destination, shipping choice) and address book back exactly afterwards. His
// default address becomes the destination for him, the operator's default option is chosen (or,
// with none, the section asks and the test chooses: support/shipping-choice.ts), and the
// summary shows the API's row; «افزودن آدرس جدید» opens the address book's sheet (its
// code loads then), closed unsaved. Nothing is ordered (Task 3).

kamranTest.describe.configure({ mode: 'serial' })

const PRODUCT = 'nestle-coffee-gold'
const toman = (amount: number) => `${new Intl.NumberFormat('fa-IR').format(amount)} تومان`
const cartOf = async (response: Response) => ((await response.json()) as { data: Cart }).data

kamranTest(
  'signed in: the default address is the destination, the default option is chosen',
  async ({ page, kamran }) => {
    const errors = watchErrors(page)
    const home = kamran.before.addresses[0]
    expect(home, 'k.yazdi has a saved address (the sample data)').toBeDefined()
    await page.goto(`/product/${PRODUCT}/`)
    await shellHydrated(page)
    const added = await cartWrite(
      page,
      { method: 'POST', path: 'cart/item/add/', label: 'add' },
      () =>
        page
          .getByRole('region', { name: 'خرید', exact: true })
          .getByRole('button', { name: 'افزودن به سبد خرید' })
          .click(),
    )

    // The checkout: his default address posted for him, then the operator's default option
    // chosen by the page itself (its waiter set before the visit that leads to it).
    const hadAddress = kamran.before.destination !== null && 'address' in kamran.before.destination
    const auto = cartAnswer(page, SHIPPING_SELECT)
    let destination: Response | null = null
    if (hadAddress) await page.goto('/checkout/')
    else {
      destination = await cartWrite(
        page,
        { method: 'POST', path: 'cart/destination/', label: 'destination' },
        () => page.goto('/checkout/'),
        { retry: () => page.reload() },
      )
      expect(destination.request().postDataJSON()).toEqual({ address: home!.id })
    }
    const shipping = page.getByRole('region', { name: /روش ارسال/ })
    const { response: selected } = await chooseShipping(page, shipping, {
      answer: auto,
      // The cart the choice follows: the destination's answer, else the add's.
      before: await cartOf(destination ?? added),
      retry: () => page.reload(),
    })
    const cart = await cartOf(selected)
    expect(cart.shipping.is_selected && cart.shipping.is_available).toBe(true)
    expect(cart.shipping.cash_on_delivery).toBe(false)

    const receiver = page.getByRole('region', { name: /گیرنده و آدرس/ })
    await expect(receiver).toHaveAttribute('data-state', 'done')
    await expect(receiver).toContainText(home!.title)
    await expect(shipping).toContainText(cart.shipping.title!)
    const summary = page
      .getByRole('complementary')
      .getByRole('region', { name: 'خلاصه\u{0654} سفارش' })
    await expect(summary).toContainText(toman(cart.total))

    // «ویرایش»: his addresses as radios, his own chosen; «افزودن آدرس جدید» opens the sheet.
    await receiver.getByRole('button', { name: /ویرایش/ }).click()
    const group = page.getByRole('radiogroup', { name: 'آدرس ارسال' })
    await expect(group.getByRole('radio', { name: new RegExp(home!.title) })).toBeChecked()
    await page.getByRole('button', { name: 'افزودن آدرس جدید' }).click()
    const sheet = page.getByRole('dialog', { name: 'افزودن آدرس جدید' })
    await expect(sheet).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(sheet).toBeHidden()
    expect(errors).toEqual([])
  },
)
