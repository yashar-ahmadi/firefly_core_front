import { expect, type Page } from '@playwright/test'
import { RECEIVER_DRAFT_KEY } from '@/features/checkout/receiver-draft'
import { defaultOption } from '@/features/checkout/shipping-labels'
import type { Paginated } from '@/lib/api/types/common'
import type { City, Province } from '@/lib/api/types/geo'
import type { ShippingOptionList } from '@/lib/api/types/shipping'
import { requestCartWrite } from './cart-write'

// The checkout's states for the JavaScript budget (support/js-budget.ts measures; this sets them
// up and checks the page reached them). Cart writes go through the cart-write guard.

const STATE_TIMEOUT_MS = 15_000

/**
 * The checkout's states measured (Plan 4; Task 3's amendment: what visitors actually load, each
 * held to `CHECKOUT_BUDGET_KB`):
 * - `guest`: a product in this context's own cart, nothing else: the receiver step is open;
 * - `guest-review`: the same cart with Tehran as its destination and the operator's default
 *   shipping chosen (through the API), and the guest's receiver confirmed in this tab's
 *   sessionStorage: a guest back at the checkout (a reload), the review open at once;
 * - `signed-in`: sara's cart as it is, the writes the page would make by itself (the default
 *   address as the destination, the default shipping option) refused before they leave the
 *   browser: the shared account is only read;
 * - `signed-in-review`: a signed-in cart already at the review (its destination one of the
 *   account's addresses, its shipping chosen: k.yazdi's, left so by his journey,
 *   checkout/checkout-signed-in.spec.ts); the page has nothing to write, and any write is
 *   refused all the same;
 * - `signed-in-first`: the same account's first visit with a cart that has no destination: the
 *   page posts the default address and chooses the default shipping by itself (writes allowed:
 *   the journey's guard puts the cart back).
 */
export type CheckoutState =
  'guest' | 'guest-review' | 'signed-in' | 'signed-in-review' | 'signed-in-first'

const BFF = { 'X-Requested-With': 'ff' }
/** A simple product with stock to spare (the cart's e2e product). */
const SEED_VARIANT = 10123
const CHECKOUT_WRITES = /\/api\/bff\/cart\/(?:destination|shipping\/select)\/$/

/** The step the state must show open before its scripts are summed (none: the cart decides). */
const OPEN_STEP: Partial<Record<CheckoutState, string>> = {
  guest: 'receiver',
  'guest-review': 'review',
  'signed-in-review': 'review',
}

/**
 * One line in this context's guest cart, through the cart-write guard: the dev SQLite lock's 500
 * (confirmed by the backend's log, the cart unchanged) is repeated once with a warning; any other
 * failure fails the measure.
 */
async function seedCart(page: Page): Promise<void> {
  await requestCartWrite(
    page.request,
    { method: 'POST', path: 'cart/item/add/', label: "cart/item/add/ for the checkout's measure" },
    () =>
      page.request.post('/api/bff/cart/item/add/', {
        headers: BFF,
        data: { variant: SEED_VARIANT, quantity: 1 },
      }),
  )
}

async function geo<T>(page: Page, path: string): Promise<T[]> {
  const response = await page.request.get(`/api/bff/transportation/${path}`, { headers: BFF })
  expect(response.ok(), path).toBe(true)
  return ((await response.json()) as { data: Paginated<T> }).data.results
}

/**
 * A guest back at the checkout (`guest-review`): this context's cart with a product, Tehran as
 * its destination and the operator's default shipping option chosen (else the first available,
 * as a shopper would), each through the cart-write guard; and, in this tab's sessionStorage
 * before any page script runs, the receiver the guest confirmed with «ادامه».
 */
async function seedGuestReview(page: Page): Promise<void> {
  await seedCart(page)
  const tehran = (await geo<Province>(page, 'province/list/?limit=1500')).find(
    (province) => province.name === 'تهران',
  )
  expect(tehran, 'the province Tehran').toBeDefined()
  const cities = await geo<City>(page, `city/list/?province=${tehran!.id}&limit=1500`)
  const city = cities.find((item) => item.name === 'تهران') ?? cities[0]
  expect(city, "one of Tehran's cities").toBeDefined()
  await requestCartWrite(
    page.request,
    {
      method: 'POST',
      path: 'cart/destination/',
      label: "cart/destination/ for the review's measure",
    },
    () =>
      page.request.post('/api/bff/cart/destination/', {
        headers: BFF,
        data: { province: tehran!.id, city: city!.id },
      }),
  )
  const list = await page.request.get('/api/bff/cart/shipping/option/list/', { headers: BFF })
  expect(list.ok(), 'cart/shipping/option/list/').toBe(true)
  const { options } = ((await list.json()) as { data: ShippingOptionList }).data
  const option = defaultOption(options) ?? options.find((item) => item.is_available)
  expect(option, 'a shipping option for Tehran').toBeDefined()
  await requestCartWrite(
    page.request,
    {
      method: 'POST',
      path: 'cart/shipping/select/',
      label: "cart/shipping/select/ for the review's measure",
    },
    () =>
      page.request.post('/api/bff/cart/shipping/select/', {
        headers: BFF,
        data: { code: option!.code, cash_on_delivery: false },
      }),
  )
  const draft = JSON.stringify({
    values: {
      province: tehran!.id,
      city: city!.id,
      address: 'خیابان آزمون، کوچه\u{0654} یک',
      plaque: '',
      unit: '',
      postalCode: '1234567890',
      firstName: 'آزمون',
      lastName: 'بودجه',
      mobile: '09120000000',
      customerMobile: '',
    },
    confirmed: true,
  })
  await page.addInitScript(
    ([key, text]) => {
      try {
        if (sessionStorage.getItem(key!) === null) sessionStorage.setItem(key!, text!)
      } catch {
        // No storage: the measure's step check says so.
      }
    },
    [RECEIVER_DRAFT_KEY, draft],
  )
}

/** This context set up for `state` before its page loads (a guest's cart, refused writes). */
export async function prepareCheckout(page: Page, state: CheckoutState): Promise<void> {
  if (state === 'guest') await seedCart(page)
  if (state === 'guest-review') await seedGuestReview(page)
  if (state === 'signed-in' || state === 'signed-in-review') {
    await page.route(CHECKOUT_WRITES, (write) => write.abort())
  }
}

/** The page loaded shows `state` (its step open, or as far as the page goes by itself). */
export async function checkoutReached(
  page: Page,
  state: CheckoutState,
  device: string,
): Promise<void> {
  const step = OPEN_STEP[state]
  if (step) {
    await expect(
      page.locator(`section[data-step="${step}"]`),
      `${device}: the checkout's ${step} step open`,
    ).toHaveAttribute('data-state', 'active', { timeout: STATE_TIMEOUT_MS })
  }
  if (state === 'signed-in-first') {
    // The page's own writes, one after the other: until the review is open, or the shipping
    // step asks (no default option for the destination).
    await expect(
      page
        .locator('section[data-step="review"][data-state="active"]')
        .or(page.getByText('یک روش ارسال انتخاب کنید.')),
      `${device}: the checkout went as far as it goes by itself`,
    ).toBeVisible({ timeout: STATE_TIMEOUT_MS })
  }
}

/** A guest's cart cleared after its measure. */
export async function leaveCheckout(page: Page, state: CheckoutState): Promise<void> {
  if (state !== 'guest' && state !== 'guest-review') return
  await page.request.delete('/api/bff/cart/clear/', { headers: BFF }).catch(() => undefined)
}
