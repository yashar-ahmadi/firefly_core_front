import { expect, type Locator, type Page, type Response } from '@playwright/test'
import { defaultOption } from '@/features/checkout/shipping-labels'
import type { ShippingOption, ShippingOptionList } from '@/lib/api/types/shipping'
import { cartWrite, type CartWriteOptions, type CartWriteSpec } from './cart-write'

// The checkout's shipping step against the dev backend (Plan 4 Task 2, controller ruling of fix
// round 1). With nothing chosen the page chooses the operator's default by itself: the first
// option in the API's order that is available and whose sender pays (`defaultOption`, the app's
// own rule). With none, it chooses nothing and asks; the test then chooses the first available
// option itself, as a shopper would, and closes the step. Either way the write goes through
// `cartWrite` (the dev SQLite lock is repeated once, logged).

export const SHIPPING_SELECT: CartWriteSpec = {
  method: 'POST',
  path: 'cart/shipping/select/',
  label: 'shipping',
}

/**
 * The cart's options for its destination, in the API's order, as the page reads them (its own
 * fetch, so a route the test set on the page applies to both).
 */
export async function shippingOptions(page: Page): Promise<ShippingOption[]> {
  const { status, body } = await page.evaluate(async () => {
    const response = await fetch('/api/bff/cart/shipping/option/list/', {
      headers: { 'X-Requested-With': 'ff' },
    })
    return { status: response.status, body: await response.text() }
  })
  expect(status, `cart/shipping/option/list/: ${status} ${body.slice(0, 200)}`).toBe(200)
  return (JSON.parse(body) as { data: ShippingOptionList }).data.options
}

export interface ShippingChoice {
  /** The select's answer (its request's body says the code and the COD flag sent). */
  response: Response
  /** The page chose it by itself (the operator's default), or the test did. */
  auto: boolean
}

interface ChooseOptions extends Pick<CartWriteOptions, 'before' | 'retry' | 'answer'> {
  /** The action after which the page chooses by itself (by default none: `answer` is set). */
  lead?: () => Promise<unknown>
}

/**
 * The cart's shipping chosen in `section` (the «روش ارسال» step), as the page would choose it:
 * the operator's default when the cart's options have one (checked to be the code sent, without
 * COD), else the first available option, chosen by the test once the section asks.
 */
export async function chooseShipping(
  page: Page,
  section: Locator,
  { lead = async () => {}, before, retry, answer }: ChooseOptions,
): Promise<ShippingChoice> {
  const options = await shippingOptions(page)
  const expected = defaultOption(options)
  if (expected) {
    const response = await cartWrite(page, SHIPPING_SELECT, lead, { before, retry, answer })
    expect(response.request().postDataJSON(), 'the operator’s default, prepaid').toEqual({
      code: expected.code,
      cash_on_delivery: false,
    })
    return { response, auto: true }
  }
  await lead()
  await expect(section.getByText('یک روش ارسال انتخاب کنید.')).toBeVisible()
  const manual = options.find((option) => option.is_available)
  expect(manual, 'an available shipping option for this destination').toBeDefined()
  const radio = section.locator(`[data-option="${manual!.code}"]`).getByRole('radio')
  const response = await cartWrite(
    page,
    { ...SHIPPING_SELECT, label: 'shipping (chosen by the test)' },
    () => radio.check(),
    { before },
  )
  await section.getByRole('button', { name: 'ادامه با این روش ارسال' }).click()
  return { response, auto: false }
}
