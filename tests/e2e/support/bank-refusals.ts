import { expect, type Locator, type Page, type Response } from '@playwright/test'
import { forgiveFailure } from './watch-errors'

// The dev backend runs no bank (digest §11 #3): a named gateway answers 400 `gateway_unknown`, and
// the page withdraws it and offers the next one, until none is left and the bank routes close
// (order digest §5.4, §8.3). How many gateways the shop lists is the dev data's (two today): the
// journeys press once per gateway the page offers, however many, never one tried before, and stop
// when the bank closes (at most `MAX_PRESSES`: each press is one of the 30 an hour of
// `payment_attempt`). Used by checkout/checkout-place.spec.ts and checkout/pay-link.spec.ts.

const MAX_PRESSES = 6
const ANOTHER = 'این درگاه در حال حاضر در دسترس نیست'
const CLOSED = 'پرداخت با درگاه بانکی در این فروشگاه اکنون ممکن نیست'

/** The `gateway_code` an intent named (none: the shop's default). */
export const namedGateway = (response: Response): string | undefined =>
  (response.request().postDataJSON() as { gateway_code?: string } | null)?.gateway_code

export interface NamedRefusals {
  /** The answer to the first intent, which named a gateway. */
  first: Response
  /** The routes section's own alert. */
  alert: Locator
  /** Presses the pay button once more. */
  press: () => Promise<unknown>
  /** An intent's answer (the link door's or the owner's). */
  isIntent: (response: Response) => boolean
  /** Checked enabled while another gateway is offered (the bank route's radio). */
  bankRoute?: Locator
}

/**
 * Presses on through the gateways the page offers after each `gateway_unknown`, until the bank
 * closes; returns the gateways tried, in order. Each answer is 400 `gateway_unknown` for a named
 * gateway not tried before (the console's 400 accounted for).
 */
export async function pressUntilBankCloses(
  page: Page,
  { first, alert, press, isIntent, bankRoute }: NamedRefusals,
): Promise<string[]> {
  const tried: string[] = []
  let answer = first
  for (;;) {
    const code = namedGateway(answer)
    expect(code, 'a named gateway').toBeTruthy()
    expect(tried, 'never a withdrawn gateway again').not.toContain(code)
    tried.push(code!)
    expect(answer.status(), `${code}: refused`).toBe(400)
    const { data } = (await answer.json()) as { data: { errors: { code: string }[] } }
    expect(data.errors[0]?.code).toBe('gateway_unknown')
    forgiveFailure(page, answer.url(), 400)
    // The alert after this answer (the press cleared the one before): another gateway, or none.
    const closed = alert.getByText(CLOSED)
    await expect(closed.or(alert.getByText(ANOTHER))).toBeVisible()
    if (await closed.isVisible()) return tried
    expect(tried.length, `at most ${MAX_PRESSES} presses`).toBeLessThan(MAX_PRESSES)
    if (bankRoute) await expect(bankRoute).toBeEnabled()
    const next = page.waitForResponse(isIntent)
    await press()
    answer = await next
  }
}
