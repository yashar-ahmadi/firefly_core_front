import { expect, type Response } from '@playwright/test'
import type { Cart } from '@/lib/api/types/cart'
import type { OrderPlacementResult } from '@/lib/api/types/order'
import type { PaymentIntent } from '@/lib/api/types/payment'
import { toPersianDigits } from '@/lib/format/digits'
import { cartWrite, requestCartWrite } from '../support/cart-write'
import { shellHydrated } from '../support/hydrated'
import { readWallet } from '../support/shirin'
import { shirinGuardedTest as test } from '../support/shirin-guard'
import { watchErrors } from '../support/watch-errors'

// A signed-in purchase paid wholly by the wallet (Plan 4 Task 10), shirin's (ruling P4-R4: the
// wallet's account, never sara's), in the `journeys` project. OPT-IN, run once: the order cannot
// be undone by the customer. A wallet payment settles at once and moves the order to «در حال
// انجام» (backend `_open_wallet`), and only an order awaiting payment is customer-cancellable
// (`CUSTOMER_CANCELLABLE_STATUSES`), so the money stays spent and the order stays in the dev
// database. `E2E_LIVE_WALLET_ORDER=1` runs it; it prints the order's code and the amount spent.
// The cheapest product, her default address (Tehran), the operator's default shipping, «کیف پول»,
// the review, «ثبت سفارش و پرداخت» → the thanks page («… در حال انجام است») → the order in
// «جاری» with the API's status; her balance less exactly what the order took (from the API).
// Her cart and address book are put back by the `shirin` guard, and an order left awaiting
// payment (the wallet route refused) is cancelled by the `orders` guard, however the test ends;
// once the wallet has settled it, the guard is told to leave it (`keep`).
// Per run: 1 placement, 1 wallet intent (`payment_attempt`), 1 wallet debit.

const LIVE = process.env.E2E_LIVE_WALLET_ORDER === '1'
/** The cheapest product in the sample data (180,000 Toman, plenty of stock). */
const PRODUCT = 'tempered-glass-universal'
const BFF = { 'X-Requested-With': 'ff' }
const isPlacement = (response: Response) =>
  new URL(response.url()).pathname === '/api/bff/order/place/' &&
  response.request().method() === 'POST'
const isIntent = (response: Response) =>
  /\/api\/bff\/payment\/order\/[^/]+\/intent\/$/.test(new URL(response.url()).pathname)

// Skipped where it is declared (not in the test's body): a routine run sets up none of its
// fixtures, so it reads and writes nothing of shirin's.
test.skip(!LIVE, 'opt-in (E2E_LIVE_WALLET_ORDER=1): a wallet-paid order cannot be cancelled')

test('shirin pays a whole order from her wallet; it is in «جاری», her balance less its total', async ({
  page,
  shirin,
  orders,
}) => {
  test.slow()
  const errors = watchErrors(page)
  // Only this product in the order: her cart emptied first (the guard puts it back after).
  const cart = await shirin.request.get('/api/bff/cart/', { headers: BFF })
  if (!((await cart.json()) as { data: Cart }).data.is_empty) {
    await requestCartWrite(shirin.request, { method: 'DELETE', path: 'cart/clear/' }, () =>
      shirin.request.delete('/api/bff/cart/clear/', { headers: BFF }),
    )
  }
  page.on('response', (response) => {
    if (!isPlacement(response) || !response.ok()) return
    orders.settle(
      response
        .json()
        .then(({ data }: { data: OrderPlacementResult }) =>
          orders.track({ code: data.order_code, storageState: shirin.storageState }),
        )
        .catch(() => undefined),
    )
  })

  await page.goto(`/product/${PRODUCT}/`)
  await shellHydrated(page)
  await cartWrite(page, { method: 'POST', path: 'cart/item/add/', label: 'add' }, () =>
    page
      .getByRole('region', { name: 'خرید', exact: true })
      .getByRole('button', { name: 'افزودن به سبد خرید' })
      .click(),
  )
  await page.goto('/checkout/')
  // Her default address and the operator's default shipping, chosen for her; the bank first.
  const payment = page.getByRole('region', { name: /۳.*پرداخت/ })
  await expect(payment).toHaveAttribute('data-state', 'done')
  await payment.getByRole('button', { name: /ویرایش/ }).click()
  const wallet = page.locator('[data-route="wallet"]').getByRole('radio')
  await expect(wallet).toBeEnabled()
  await wallet.check()
  await page.getByRole('button', { name: 'ادامه با این روش پرداخت' }).click()
  await expect(payment).toContainText('کیف پول')
  const review = page.getByRole('region', { name: /بازبینی و ثبت سفارش/ })
  await expect(review).toHaveAttribute('data-state', 'active')
  for (const name of [/قوانین و مقررات/, /سن قانونی/])
    await review.getByRole('checkbox', { name }).check()

  const placement = page.waitForResponse(isPlacement)
  const intent = page.waitForResponse(isIntent)
  await review.getByRole('button', { name: 'ثبت سفارش و پرداخت' }).click()
  expect((await placement).status(), 'a new order').toBe(201)
  const order = ((await (await placement).json()) as { data: OrderPlacementResult }).data
  const paid = await intent
  expect(paid.status(), 'the wallet pays it').toBe(201)
  expect((paid.request().postDataJSON() as { route: string }).route).toBe('wallet')
  const settled = ((await paid.json()) as { data: PaymentIntent }).data
  expect(settled.payment?.status, 'settled at once').toBe('settled')
  // Paid: in progress now, which no customer can cancel; the guard leaves it (and says so).
  orders.keep(order.order_code, 'paid from her wallet (opt-in): in progress, not cancellable')
  expect(settled.payment?.amount).toBe(order.amount_charged_online)

  // The thanks page, then the order under «جاری» with the API's status.
  await page.waitForURL(new RegExp(`/checkout/thanks/${order.order_code}/$`))
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('سفارش شما پرداخت شد')
  await expect(page.getByText('سفارش شما در حال انجام است', { exact: false })).toBeVisible()
  await page.goto('/account/orders/?group=in_progress')
  const card = page.getByRole('article', { name: new RegExp(toPersianDigits(order.order_code)) })
  const read = await shirin.request.get(`/api/bff/order/${order.order_code}/`, { headers: BFF })
  const status = ((await read.json()) as { data: { status: string; status_display: string } }).data
  expect(status.status, 'paid: in progress').toBe('processing')
  await expect(card).toContainText(status.status_display)
  await expect(card.getByRole('button', { name: 'لغو سفارش' })).toHaveCount(0)

  // Her balance: less exactly what the order took (the API's figures).
  const after = await readWallet(shirin.request)
  expect(after.balance).toBe(shirin.wallet.balance - order.amount_charged_online)
  console.log(
    `[user-wallet] LIVE wallet order ${order.order_code}: ${order.amount_charged_online} Toman ` +
      `spent (balance ${shirin.wallet.balance} → ${after.balance})`,
  )
  expect(errors).toEqual([])
})
