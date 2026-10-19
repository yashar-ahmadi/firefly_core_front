import { expect, type APIResponse, type Response } from '@playwright/test'
import type { Cart } from '@/lib/api/types/cart'
import type { OrderPlacementResult } from '@/lib/api/types/order'
import { cartAnswer, cartWrite, requestCartWrite } from '../support/cart-write'
import { enforce, measure, measurePhone, type BudgetRoute } from '../support/js-budget'
import { kamranTest } from '../support/kamran-guard'
import { chooseShipping, SHIPPING_SELECT } from '../support/shipping-choice'
import { forgiveFailure, watchErrors } from '../support/watch-errors'

// The signed-in checkout (Plan 4 Task 2), in the `journeys` project only
// (playwright.config.ts): k.yazdi (ruling P4-R4), signed in by the `kamran` guard, which puts
// his cart (lines, destination, shipping choice) and address book back exactly afterwards. His
// default address becomes the destination for him, the operator's default option is chosen (or,
// with none, the section asks and the test chooses: support/shipping-choice.ts), and the
// summary shows the API's row; «افزودن آدرس جدید» opens the address book's sheet (its
// code loads then), closed unsaved.
// The JavaScript budget signed in (Task 3's amendment; support/js-budget.ts): the first visit
// (the page's own writes, one after the other) is measured as it happens, the context's first
// page; then the checkout at the review, as he would find it again, in fresh contexts on a
// desktop and on a phone. No other login: his session, his cart, the guard's restore.
// Then the order is placed through the review (Plan 4 Task 10): the bank, the default, refused by
// the dev backend (digest §11 #3), the order kept on the page; the `kamran` guard cancels it.
// Per run: 1 placement, 1 payment intent (refused; his own `payment_attempt` budget), 1 cancel.

kamranTest.describe.configure({ mode: 'serial' })

/** A simple product with stock to spare (the cart's e2e product, as support/js-budget.ts's). */
const VARIANT = 10123
const toman = (amount: number) => `${new Intl.NumberFormat('fa-IR').format(amount)} تومان`
const cartOf = async (response: Response | APIResponse) =>
  ((await response.json()) as { data: Cart }).data
const FIRST: BudgetRoute = { name: 'checkout', path: '/checkout/', checkout: 'signed-in-first' }
const REVIEW: BudgetRoute = { name: 'checkout', path: '/checkout/', checkout: 'signed-in-review' }
const isPlacement = (response: Response) =>
  new URL(response.url()).pathname === '/api/bff/order/place/' &&
  response.request().method() === 'POST'
const isIntent = (response: Response) =>
  /\/api\/bff\/payment\/order\/[^/]+\/intent\/$/.test(new URL(response.url()).pathname)

kamranTest(
  'signed in: the default address is the destination, the default option is chosen; placed',
  async ({ page, kamran, browser }, info) => {
    const errors = watchErrors(page)
    const home = kamran.before.addresses[0]
    expect(home, 'k.yazdi has a saved address (the sample data)').toBeDefined()
    // A product in his cart through the API: the checkout is this context's first page (the
    // first visit's scripts are measured from a cold cache). The product page's own button has
    // its journeys elsewhere (cart, checkout-place).
    const added = await requestCartWrite(
      kamran.request,
      { method: 'POST', path: 'cart/item/add/', label: 'add' },
      () =>
        kamran.request.post('/api/bff/cart/item/add/', {
          headers: { 'X-Requested-With': 'ff' },
          data: { variant: VARIANT, quantity: 1 },
        }),
    )

    // The checkout: his default address posted for him, then the operator's default option
    // chosen by the page itself (its waiter set before the visit that leads to it).
    const hadAddress = kamran.before.destination !== null && 'address' in kamran.before.destination
    const auto = cartAnswer(page, SHIPPING_SELECT)
    let destination: Response | null = null
    const visit = () => measure(page, FIRST, 'desktop, signed in', { signedIn: true })
    let first: Awaited<ReturnType<typeof visit>> | null = null
    if (hadAddress) first = await visit()
    else {
      destination = await cartWrite(
        page,
        { method: 'POST', path: 'cart/destination/', label: 'destination' },
        async () => (first = await visit()),
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

    // Back at the checkout later: the review open at once, on a desktop and on a phone.
    const storageState = await page.context().storageState()
    const context = await browser.newContext({ storageState })
    try {
      const desktop = await measure(await context.newPage(), REVIEW, 'desktop, signed in', {
        signedIn: true,
      })
      const phone = await measurePhone(browser, REVIEW, {
        storageState,
        device: 'phone, signed in',
        signedIn: true,
      })
      enforce(info, ...(first ? [first] : []), desktop, phone)
    } finally {
      await context.close()
    }

    // The order placed through the review (Task 10: the only signed-in placement of a routine
    // run). The bank is the default and the dev backend refuses it: the order stays, here, and
    // the page asks for nothing the spent cart no longer has (its shipping options: 404).
    await page.goto('/checkout/')
    const review = page.getByRole('region', { name: /بازبینی و ثبت سفارش/ })
    await expect(review).toHaveAttribute('data-state', 'active')
    for (const name of [/قوانین و مقررات/, /سن قانونی/])
      await review.getByRole('checkbox', { name }).check()
    const placement = page.waitForResponse(isPlacement)
    const intent = page.waitForResponse(isIntent)
    await review.getByRole('button', { name: 'ثبت سفارش و پرداخت' }).click()
    expect((await placement).status(), 'a new order').toBe(201)
    const order = ((await (await placement).json()) as { data: OrderPlacementResult }).data
    kamran.track(order.order_code)
    expect((await placement).request().postDataJSON()).toEqual({ expected_total: cart.total })
    const bank = await intent
    expect([400, 503], 'the dev bank refuses').toContain(bank.status())
    forgiveFailure(page, bank.url(), bank.status())
    await expect(page.getByRole('region', { name: 'سفارش شما ثبت شد' })).toBeVisible()
    expect(new URL(page.url()).pathname, 'no navigation').toBe('/checkout/')
    expect(errors).toEqual([])
  },
)
