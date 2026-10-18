import { expect, type Response } from '@playwright/test'
import { cancelOpenWithdrawals, readWallet, SHIRIN, shirinTest } from '../support/shirin'
import { forgiveFailure, watchErrors } from '../support/watch-errors'

// shirin's wallet moving money against the dev backend (Plan 4 Task 9), in the `journeys` project
// only (playwright.config.ts; ruling P4-R4: her wallet, never sara's): a top-up the dev bank
// refuses (digest §11 #3: said, no navigation, no money moved), then ONE withdrawal request,
// cancelled in the same test (the money back at once, §3.3.6): her balance exactly as before.
// A guard cancels any open request of hers before and after, however the test ends (the
// `wallet_withdrawal` budget is 5 an hour, counted on success: one request per run). Per run: 1
// top-up attempt (refused), 1 withdrawal request, 1 cancellation (+ the guard's, if a run broke
// off).

shirinTest.describe.configure({ mode: 'serial' })

const BFF_PATH = (path: string) => (response: Response) =>
  new URL(response.url()).pathname === `/api/bff/${path}` && response.request().method() === 'POST'
const toPersian = (digits: string | number) =>
  String(digits).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!)
const toman = (amount: number) =>
  `${toPersian(amount.toLocaleString('en-US')).replace(/,/g, '\u{066C}')} تومان`
/** Her own sheba (accepted by the backend before). */
const SHEBA = 'IR062960000000100324200001'

shirinTest(
  'shirin: a top-up refused by the dev bank, one withdrawal requested and cancelled, the balance as before',
  async ({ page }) => {
    const errors = watchErrors(page)
    const left = await cancelOpenWithdrawals(page.request)
    if (left > 0) console.warn(`[wallet-journey] cancelled ${left} request(s) an earlier run left`)
    const before = await readWallet(page.request)
    expect(before.is_frozen, 'shirin’s wallet is not frozen (the dev data)').toBe(false)
    const amount = before.minimum_withdrawal_amount
    expect(before.balance, 'her balance covers the minimum withdrawal').toBeGreaterThanOrEqual(
      amount,
    )
    try {
      await page.goto('/account/wallet/')
      const balance = page.getByRole('region', { name: 'موجودی', exact: true })
      await expect(balance).toContainText(toman(before.balance))

      // A top-up: the dev bank refuses every gateway (400 gateway_unknown when one is named).
      const box = page.getByRole('region', { name: 'افزایش موجودی' })
      await box.getByRole('textbox', { name: /مبلغ شارژ/ }).fill('100000')
      const topUp = page.waitForResponse(BFF_PATH('wallet/top-up/'))
      await box.getByRole('button', { name: 'افزایش موجودی' }).click()
      const refused = await topUp
      expect([400, 503]).toContain(refused.status())
      expect(refused.request().headers()['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/)
      forgiveFailure(page, refused.url(), refused.status())
      // 400 gateway_unknown: that gateway left out, said; 503 gateway_not_configured: the box
      // closes with the support line.
      await expect(
        box.getByRole('alert').or(box.getByText(/شارژ کیف پول با درگاه بانکی/)),
      ).toBeVisible()
      expect(new URL(page.url()).pathname).toBe('/account/wallet/')
      expect((await readWallet(page.request)).balance).toBe(before.balance)

      // One withdrawal request: the money leaves the balance now (the API's figures).
      const tabs = page.getByRole('navigation', { name: 'بخش‌های کیف پول' })
      await tabs.getByRole('link', { name: 'برداشت' }).click()
      await page.getByRole('button', { name: 'درخواست برداشت جدید' }).click()
      await page.getByRole('textbox', { name: /مبلغ برداشت/ }).fill(String(amount))
      await page.getByRole('textbox', { name: /نام صاحب حساب/ }).fill(SHIRIN.fullName)
      await page.getByRole('textbox', { name: /شماره شبا/ }).fill(SHEBA)
      const filed = page.waitForResponse(BFF_PATH('wallet/withdrawal/request/'))
      await page.getByRole('button', { name: 'ثبت درخواست برداشت' }).click()
      expect((await filed).status()).toBe(201)
      const open = page.getByRole('region', { name: 'درخواست برداشت باز' })
      await expect(open).toContainText('در انتظار بررسی')
      await expect(open).toContainText(toman(amount))
      const during = await readWallet(page.request)
      expect(during.balance).toBe(before.balance - amount)
      expect(during.pending_withdrawal_amount).toBe(before.pending_withdrawal_amount + amount)
      await expect(balance).toContainText(toman(during.balance))
      await expect(balance).toContainText(/در انتظار برداشت/)

      // Cancelled at once: the question starts on «انصراف»; the money is back exactly.
      await open.getByRole('button', { name: 'لغو درخواست' }).click()
      const dialog = page.getByRole('dialog', { name: 'لغو درخواست برداشت' })
      await expect(dialog.getByRole('button', { name: 'انصراف' })).toBeFocused()
      const cancelled = page.waitForResponse((response) =>
        /\/api\/bff\/wallet\/withdrawal\/[^/]+\/cancel\/$/.test(new URL(response.url()).pathname),
      )
      await dialog.getByRole('button', { name: 'لغو درخواست' }).click()
      expect((await cancelled).status()).toBe(200)
      await expect(dialog).toBeHidden()
      await expect(open).toBeHidden()
      const after = await readWallet(page.request)
      expect(after.balance).toBe(before.balance)
      expect(after.pending_withdrawal_amount).toBe(before.pending_withdrawal_amount)
      await expect(balance).toContainText(toman(before.balance))
      // The ledger has both movements (the reversal first, newest first).
      await tabs.getByRole('link', { name: 'تراکنش‌ها' }).click()
      const rows = page.getByRole('list', { name: 'تراکنش‌های کیف پول' }).getByRole('listitem')
      await expect(rows.first()).toContainText('برگشت درخواست برداشت')
      await expect(rows.nth(1)).toContainText('برداشت به حساب بانکی')
      expect(errors).toEqual([])
    } finally {
      const undone = await cancelOpenWithdrawals(page.request)
      if (undone > 0) console.warn(`[wallet-journey] the guard cancelled ${undone} request(s)`)
      const end = await readWallet(page.request)
      expect(end.balance, 'her balance is back exactly').toBe(before.balance)
    }
  },
)
