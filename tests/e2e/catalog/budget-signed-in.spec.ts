import { expect, type Page } from '@playwright/test'
import type { Paginated } from '@/lib/api/types/common'
import type { OrderListItem } from '@/lib/api/types/order-detail'
import {
  budgetOf,
  CHECKOUT_BUDGET_KB,
  deviceLabel,
  enforce,
  measure,
  measurePhone,
  measuresBudget,
  pushShop,
  type BudgetRoute,
} from '../support/js-budget'
import { signedInTest } from '../support/session'
import { seedThanks, THANKS_PATH, thanksShown } from '../support/thanks-states'

// The JavaScript budget signed in (ruling P2-R4; the measure: support/js-budget.ts): the catalog
// as sara sees it (her header, hearts and cart), the account pages that carry the most code, her
// cart page, her checkout, her orders and her wallet.
// The project's shared session on a desktop (1440 px) and on a phone (a fresh Pixel 7 context at
// 375 px with the same session). Runs in the desktop project only, which measures both, and
// again in `budget-push` (a shop with web push; the same session), with push on in the browser:
// the re-register effect's chunk loads there, the costliest case.

const BFF = { 'X-Requested-With': 'ff' }

/** The first of sara's orders in `group` the test can use (read through the BFF), or null. */
async function saraOrder(
  page: Page,
  group: 'delivered' | 'awaiting_payment',
  usable: (order: OrderListItem) => boolean = () => true,
): Promise<string | null> {
  const response = await page.request.get(`/api/bff/order/list/?status_group=${group}&limit=100`, {
    headers: BFF,
  })
  expect(response.ok(), `sara's ${group} orders through the BFF`).toBe(true)
  const list = ((await response.json()) as { data: Paginated<OrderListItem> }).data
  return list.results.find(usable)?.order_code ?? null
}

/** A route whose path is sara's data of the day (null: she has none such, the state is skipped). */
type SignedInRoute = BudgetRoute & { resolve?: (page: Page) => Promise<string | null> }

async function cardsShown(page: Page) {
  await expect(page.getByRole('article').first()).toBeVisible()
}
/** The balance and the ledger's first page (rows, or its empty sentence) are on screen. */
async function walletShown(page: Page) {
  await expect(page.getByRole('region', { name: 'موجودی', exact: true })).toBeVisible()
  await expect(
    page
      .getByRole('list', { name: 'تراکنش‌های کیف پول' })
      .or(page.getByText('هنوز تراکنشی در کیف پول شما ثبت نشده است.')),
  ).toBeVisible()
}
/** Her `GET wallet/` answered as a frozen wallet (read through, then changed: nothing written). */
async function answerWalletFrozen(page: Page) {
  await page.route(/\/api\/bff\/wallet\/$/, async (route) => {
    const response = await route.fetch()
    const body = (await response.json()) as { data: Record<string, unknown> }
    body.data = { ...body.data, is_frozen: true, freeze_message: 'کیف پول برای بررسی مسدود است.' }
    await route.fulfill({ response, json: body })
  })
}
async function paymentsShown(page: Page) {
  await expect(page.getByRole('list', { name: 'پرداخت‌های سفارش' })).toBeVisible()
}

const ROUTES: SignedInRoute[] = [
  { name: 'home', path: '/' },
  { name: 'category', path: '/product-category/digital/mobile-phone/' },
  { name: 'product', path: '/product/samsung-galaxy-s25-ultra/' },
  { name: 'account', path: '/account/' },
  { name: 'profile', path: '/account/profile/' },
  { name: 'notifications', path: '/account/notifications/' },
  // Sara's cart has lines: the cart page as a signed-in shopper sees it (read only).
  { name: 'cart', path: '/cart/' },
  // Her checkout: the address picker and the shipping step, its own writes refused (read only).
  // At the review signed in: k.yazdi's journey measures it (checkout/checkout-signed-in.spec.ts).
  { name: 'checkout', path: '/checkout/', checkout: 'signed-in' },
  // The thanks page after her placement (support/thanks-states.ts: this tab's hand-off, nothing
  // placed: P4-R4), held to the checkout's 246 KB.
  {
    name: 'checkout-thanks',
    path: THANKS_PATH,
    shownPath: '/checkout/thanks/<code>/',
    budget: CHECKOUT_BUDGET_KB,
    prepare: (page) => seedThanks(page, { guest: false }),
    ready: (page) => thanksShown(page, { guest: false }),
  },
  // Her orders (Plan 4 Task 8, read only; held to the checkout's 246 KB): every order, a group
  // she has none in (its empty state), a delivered order (tracking code, payments, reviews), the
  // order awaiting her payment (pay and cancel offered: their code loads on the press only), and
  // her purchases awaiting a review.
  { name: 'orders', path: '/account/orders/', budget: CHECKOUT_BUDGET_KB, ready: cardsShown },
  {
    name: 'orders-empty-group',
    path: '/account/orders/?group=returned',
    budget: CHECKOUT_BUDGET_KB,
    ready: (page) => expect(page.getByRole('heading', { name: /سفارشی در/ })).toBeVisible(),
  },
  {
    name: 'order-delivered',
    path: '/account/orders/<delivered>/',
    resolve: async (page) => {
      const code = await saraOrder(page, 'delivered')
      return code && `/account/orders/${code}/`
    },
    budget: CHECKOUT_BUDGET_KB,
    ready: paymentsShown,
  },
  {
    name: 'order-payable',
    path: '/account/orders/<payable>/',
    resolve: async (page) => {
      const code = await saraOrder(page, 'awaiting_payment', (order) => order.is_payable)
      return code && `/account/orders/${code}/`
    },
    budget: CHECKOUT_BUDGET_KB,
    ready: (page) => expect(page.getByRole('button', { name: 'پرداخت' })).toBeVisible(),
  },
  { name: 'reviews', path: '/account/reviews/', budget: CHECKOUT_BUDGET_KB, ready: cardsShown },
  // Her wallet (Plan 4 Task 9, read only; held to 246 KB in every state): the balance and the
  // top-up box over each tab (the ledger, the withdrawals, the payment history), and the same
  // wallet frozen (its `GET wallet/` answered frozen here: no top-up, no new withdrawal). The
  // bank's code, the withdrawal form and a payment's detail load on their press only.
  { name: 'wallet', path: '/account/wallet/', budget: CHECKOUT_BUDGET_KB, ready: walletShown },
  {
    name: 'wallet-withdrawals',
    path: '/account/wallet/?tab=withdrawals',
    budget: CHECKOUT_BUDGET_KB,
    ready: (page) =>
      expect(page.getByRole('heading', { name: 'درخواست‌های برداشت' })).toBeVisible(),
  },
  {
    name: 'wallet-history',
    path: '/account/wallet/?tab=history',
    budget: CHECKOUT_BUDGET_KB,
    ready: (page) => expect(page.getByRole('heading', { name: 'تاریخچهٔ پرداخت' })).toBeVisible(),
  },
  {
    name: 'wallet-frozen',
    path: '/account/wallet/',
    budget: CHECKOUT_BUDGET_KB,
    prepare: answerWalletFrozen,
    ready: async (page) => {
      await expect(
        page
          .getByRole('region', { name: 'موجودی', exact: true })
          .getByText('مسدود', { exact: true }),
      ).toBeVisible()
      await walletShown(page)
    },
  },
]

signedInTest.describe('JavaScript budget, signed in (production build)', () => {
  signedInTest.describe.configure({ mode: 'parallel' })

  for (const route of ROUTES) {
    signedInTest(
      `${route.name} signed in: at most ${budgetOf(route)} KB gzip of JavaScript on desktop and phone`,
      async ({ page, browser, saraState }, info) => {
        signedInTest.skip(!measuresBudget(info.project), 'measures both viewports itself')
        signedInTest.setTimeout(90_000)
        const path = route.resolve ? await route.resolve(page) : route.path
        signedInTest.skip(path === null, `sara has no order for ${route.name} (the dev data)`)
        const measured: BudgetRoute = { ...route, path: path! }
        const push = pushShop(info.project)
        const label = (device: string) =>
          deviceLabel(info.project, push ? `${device}, push on` : device)
        const desktop = await measure(page, measured, label('desktop, signed in'), {
          signedIn: true,
          push,
        })
        const phone = await measurePhone(browser, measured, {
          storageState: saraState,
          device: label('phone, signed in'),
          signedIn: true,
          push,
        })
        enforce(info, desktop, phone)
      },
    )
  }
})
