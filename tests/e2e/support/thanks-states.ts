import { expect, type Page } from '@playwright/test'
import { PLACED_KEY, type PlacedContext } from '@/features/checkout/placed-order'

// The thanks page's state for the JavaScript budget (Plan 4 final fix wave, round 2): the page is
// the browser's own, read from this tab's hand-off (`ff-checkout-placed`), so the measure sets
// that hand-off before any page script runs and places nothing. The state is the page's fullest:
// a pay-on-delivery order whose confirmation failed (`unconfirmed`: «تأیید سفارش» on screen) and,
// for a guest, its link and the countdown to its deadline. The order and its link are made up:
// nothing on the page calls the API until a press, and the measure presses nothing.

/** A made-up order code (10 digits); the page's path. */
export const THANKS_CODE = '5550001234'
export const THANKS_PATH = `/checkout/thanks/${THANKS_CODE}/`

function placed(guest: boolean): PlacedContext {
  return {
    orderCode: THANKS_CODE,
    orderUuid: '00000000-0000-4000-8000-000000000000',
    linkToken: guest ? 'e2e-budget-made-up-link-token' : null,
    paymentUrl: null,
    expiresAt: null,
    total: 2_438_000,
    A: 0,
    D: 2_438_000,
    placedAt: new Date().toISOString(),
    guest,
    route: 'pay_on_delivery',
    gatewayCode: null,
    outcome: 'unconfirmed',
    failure: 'تأیید سفارش انجام نشد.',
  }
}

/** This context's tab holds the order just placed (a guest's, or the signed-in shopper's). */
export async function seedThanks(page: Page, { guest }: { guest: boolean }): Promise<void> {
  await page.addInitScript(
    ([key, ctx]) => {
      // The deadline from the browser's own clock: 72 hours, as the server gives a guest.
      const expiresAt = ctx!.guest ? new Date(Date.now() + 72 * 3_600_000).toISOString() : null
      try {
        sessionStorage.setItem(key!, JSON.stringify({ ...ctx!, expiresAt, savedAt: Date.now() }))
      } catch {
        // No storage: `thanksShown` says so.
      }
    },
    [PLACED_KEY, placed(guest)] as const,
  )
}

/** The page shows that order (hydrated: its heading, the confirm button, a guest's link). */
export async function thanksShown(page: Page, { guest }: { guest: boolean }): Promise<void> {
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'سفارش ثبت شد اما هنوز تأیید نشده است',
  )
  await expect(page.getByRole('button', { name: 'تأیید سفارش' })).toBeVisible()
  if (guest) await expect(page.getByRole('link', { name: 'لینک تأیید سفارش' })).toBeVisible()
}
