import { expect, type Page } from '@playwright/test'
import type { Paginated } from '@/lib/api/types/common'
import type { PaymentHistoryItem } from '@/lib/api/types/payment'
import type { WalletTransaction } from '@/lib/api/types/wallet'
import { readWallet, shirinTest } from '../support/shirin'
import { watchErrors } from '../support/watch-errors'

// «کیف پول» against the dev backend (Plan 4 Task 9), read only, on every device project, as
// shirin (ruling P4-R4: the account with a wallet history; her shared session, support/shirin.ts).
// Every write the page could make (a top-up, a withdrawal, a cancel) is refused here, and none is
// expected: the journey (wallet-journey.spec.ts) is the one that writes. No figure that grows
// across runs is asserted: what the page shows is compared with what the BFF answers now.

const BFF = { 'X-Requested-With': 'ff' }
const WRITES = /\/api\/bff\/wallet\/(?:top-up|withdrawal\/request|withdrawal\/[^/]+\/cancel)\/$/

const toPersian = (digits: string | number) =>
  String(digits).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!)
const toman = (amount: number) =>
  `${toPersian(amount.toLocaleString('en-US')).replace(/,/g, '\u{066C}')} تومان`

async function read<T>(page: Page, path: string): Promise<T> {
  const response = await page.request.get(`/api/bff/${path}`, { headers: BFF })
  expect(response.ok(), `${path} through the BFF`).toBe(true)
  return ((await response.json()) as { data: T }).data
}

async function refuseWrites(page: Page): Promise<string[]> {
  const tried: string[] = []
  await page.route(WRITES, (route) => {
    tried.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`)
    return route.abort()
  })
  return tried
}

shirinTest(
  'the wallet: her balance, the top-up box with its bounds, the ledger as the API gives it',
  async ({ page }) => {
    const errors = watchErrors(page)
    const tried = await refuseWrites(page)
    const wallet = await readWallet(page.request)
    const ledger = await read<Paginated<WalletTransaction>>(page, 'wallet/transaction/list/')
    expect(ledger.results.length, 'shirin has a wallet history (the dev data)').toBeGreaterThan(0)
    const credits = await read<Paginated<WalletTransaction>>(
      page,
      'wallet/transaction/list/?direction=credit',
    )

    const response = await page.goto('/account/wallet/')
    expect(response?.status()).toBe(200)
    expect(response?.headers()['cache-control']).toContain('no-store')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
    await expect(page).toHaveTitle(/^کیف پول \| /)
    await expect(page.getByRole('heading', { level: 1, name: 'کیف پول' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'موجودی', exact: true })).toContainText(
      toman(wallet.balance),
    )

    // The top-up box: its bounds in Persian digits; an amount under the floor refused here.
    const box = page.getByRole('region', { name: 'افزایش موجودی' })
    await expect(box).toBeVisible()
    const amount = box.getByRole('textbox', { name: /مبلغ شارژ/ })
    await expect(amount).toHaveAccessibleDescription(
      new RegExp(`حداقل ${toman(wallet.minimum_top_up_amount)}`),
    )
    await amount.fill(String(Math.max(1, wallet.minimum_top_up_amount - 1)))
    await expect(amount).toHaveValue(/^[۰-۹٬]+$/)
    await box.getByRole('button', { name: 'افزایش موجودی' }).click()
    await expect(amount).toHaveAccessibleDescription(/حداقل مبلغ شارژ/)

    // The ledger: the first row's balance after it, as the API gives it.
    const rows = page.getByRole('list', { name: 'تراکنش‌های کیف پول' }).getByRole('listitem')
    await expect(rows.first()).toContainText(toman(ledger.results[0]!.balance_after))
    await expect(rows).toHaveCount(Math.min(ledger.results.length, ledger.page_size))

    // A filter: the URL's, and the credits' page on screen (once it has answered).
    const filtered = page.waitForResponse((answer) => {
      const url = new URL(answer.url())
      return (
        url.pathname === '/api/bff/wallet/transaction/list/' &&
        url.searchParams.get('direction') === 'credit'
      )
    })
    await page.getByRole('combobox', { name: 'نوع تراکنش' }).selectOption('credit')
    await expect(page).toHaveURL(/\/account\/wallet\/\?direction=credit$/)
    expect((await filtered).ok()).toBe(true)
    await expect(rows).toHaveCount(Math.min(credits.results.length, credits.page_size))
    for (const row of await rows.all()) {
      await expect(row).toContainText('واریز')
      await expect(row).not.toContainText('−')
    }
    expect(tried).toEqual([])
    expect(errors).toEqual([])
  },
)

shirinTest(
  'the withdrawals and the payment history: status pills, a payment’s detail in a sheet',
  async ({ page }) => {
    const errors = watchErrors(page)
    const tried = await refuseWrites(page)
    const history = await read<Paginated<PaymentHistoryItem>>(page, 'payment/history/')
    expect(history.results.length, 'shirin has payments (the dev data)').toBeGreaterThan(0)

    await page.goto('/account/wallet/?tab=withdrawals')
    const tabs = page.getByRole('navigation', { name: 'بخش‌های کیف پول' })
    await expect(tabs.getByRole('link', { name: 'برداشت' })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('heading', { name: 'درخواست‌های برداشت' })).toBeVisible()
    await expect(
      page
        .getByRole('list', { name: 'درخواست‌های برداشت' })
        .or(page.getByText('هنوز درخواست برداشتی ثبت نکرده‌اید.')),
    ).toBeVisible()

    await tabs.getByRole('link', { name: 'تاریخچهٔ پرداخت' }).click()
    await expect(page).toHaveURL(/\/account\/wallet\/\?tab=history$/)
    const list = page.getByRole('list', { name: 'پرداخت‌های حساب' })
    await expect(list.getByRole('listitem').first()).toContainText(
      toman(history.results[0]!.amount),
    )
    await list
      .getByRole('button', { name: /جزئیات/ })
      .first()
      .click()
    const sheet = page.getByRole('dialog', { name: 'جزئیات پرداخت' })
    await expect(sheet).toContainText(toman(history.results[0]!.amount))
    await expect(sheet).toContainText(history.results[0]!.status_display)
    // The payment's uuid (a credential) never reaches the address bar; compared as a boolean, so
    // a failure never prints it.
    expect(page.url().includes(history.results[0]!.uuid), 'the uuid out of the address bar').toBe(
      false,
    )
    await page.keyboard.press('Escape')
    await expect(sheet).toBeHidden()

    // «شارژ کیف پول»: the top-ups, in the URL.
    await page.getByRole('combobox', { name: 'مربوط به' }).selectOption('wallet_topup')
    await expect(page).toHaveURL(/\?tab=history&applies_to=wallet_topup$/)
    expect(tried).toEqual([])
    expect(errors).toEqual([])
  },
)
