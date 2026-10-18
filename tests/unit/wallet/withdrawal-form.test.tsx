import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WithdrawalForm } from '@/features/wallet/withdrawal-form'
import type { WalletBalance } from '@/lib/api/types/payment'
import { stubBrowserApis } from '../support/dom-stubs'
import { balance, withdrawal } from './fixtures'
import {
  ok,
  refuse,
  refuseLive,
  renderWallet,
  serve,
  withdrawalsSent,
  type Route,
} from './wallet-support'

// A withdrawal request (order digest §3.3.4, §7): the amount (at least `minimum_withdrawal_amount`,
// at most the balance: both said), the sheba (paste-friendly: spaces, dashes, «IR», Persian and
// Arabic digits; its mod-97 checksum checked here), the account holder (≤ 120) and an optional
// card number (16 digits, Luhn) as a cross-check; when it is paid (`withdrawal_processing_days`).
// Labelled fields, errors linked to them, the first invalid one focused; one request per press.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), announce: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/components/ui/live-announcer', () => ({ announce: mocks.announce }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/account/wallet/',
}))

const PATH = 'wallet/withdrawal/request/'
const SHEBA = 'IR062960000000100324200001'

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
})

const field = (name: RegExp) => screen.getByRole('textbox', { name })
const submit = () => screen.getByRole('button', { name: /ثبت درخواست برداشت|در حال ثبت/ })

function renderForm(
  route: Route = () => ok(withdrawal({ status: 'requested' }), '', 201),
  /** What `GET wallet/` answers when read again (null: it could not be read). */
  fresh: WalletBalance | null = balance(),
) {
  serve(mocks.bffFetch, { [PATH]: route })
  const props = {
    onFiled: vi.fn(),
    onPendingExists: vi.fn(),
    onClosed: vi.fn(),
    refreshWallet: vi.fn(async () => fresh ?? undefined),
  }
  const view = renderWallet(<WithdrawalForm wallet={balance()} {...props} />)
  return { ...view, ...props, user: userEvent.setup() }
}

async function fill(user: ReturnType<typeof userEvent.setup>, sheba = SHEBA, amount = '300000') {
  await user.type(field(/مبلغ برداشت/), amount)
  await user.type(field(/نام صاحب حساب/), 'شیرین تهرانی')
  await user.click(field(/شماره شبا/))
  await user.paste(sheba)
}

describe('the sheba', () => {
  it('normalises Persian digits (and «IR», spaces, dashes) before it is sent', async () => {
    const { user } = renderForm()
    await fill(user, 'IR ۰۶۲۹-۶۰۰۰-۰۰۰۰-۱۰۰۳-۲۴۲۰-۰۰۰۱')
    expect(field(/شماره شبا/)).toHaveValue('۰۶۲۹ ۶۰۰۰ ۰۰۰۰ ۱۰۰۳ ۲۴۲۰ ۰۰۰۱')
    await user.click(submit())
    await waitFor(() =>
      expect(withdrawalsSent(mocks.bffFetch)).toEqual([
        { amount: 300_000, account_holder_name: 'شیرین تهرانی', iban: SHEBA },
      ]),
    )
  })

  it('a wrong checksum is caught here: said under the field, which takes the focus', async () => {
    const { user } = renderForm()
    await fill(user, 'IR062960000000100324200002')
    await user.click(submit())
    expect(field(/شماره شبا/)).toHaveAccessibleDescription(/شماره شبا درست نیست/)
    expect(field(/شماره شبا/)).toHaveFocus()
    expect(withdrawalsSent(mocks.bffFetch)).toHaveLength(0)
  })

  it('a left-to-right field, typed as digits', () => {
    renderForm()
    expect(field(/شماره شبا/)).toHaveAttribute('dir', 'ltr')
    expect(field(/شماره شبا/)).toHaveAttribute('inputmode', 'numeric')
  })
})

describe('the amount and the rest', () => {
  it('both bounds said; under the minimum or over the balance refused here', async () => {
    const { user } = renderForm()
    expect(field(/مبلغ برداشت/)).toHaveAccessibleDescription(
      /حداقل ۲۰۰٬۰۰۰ تومان و حداکثر ۴۵٬۱۷۰٬۰۰۰ تومان/,
    )
    await fill(user, SHEBA, '۱۰۰۰۰۰')
    await user.click(submit())
    expect(field(/مبلغ برداشت/)).toHaveAccessibleDescription(/حداقل مبلغ برداشت ۲۰۰٬۰۰۰ تومان است/)
    expect(field(/مبلغ برداشت/)).toHaveFocus()
    await user.clear(field(/مبلغ برداشت/))
    await user.type(field(/مبلغ برداشت/), '50000000')
    await user.click(submit())
    expect(field(/مبلغ برداشت/)).toHaveAccessibleDescription(/بیشتر از موجودی شما/)
    expect(withdrawalsSent(mocks.bffFetch)).toHaveLength(0)
  })

  it('the card number: optional; when given, 16 digits with a valid check digit (Luhn)', async () => {
    const { user } = renderForm()
    await fill(user)
    await user.type(field(/شماره کارت/), '6037991234567890')
    await user.click(submit())
    expect(field(/شماره کارت/)).toHaveAccessibleDescription(/شماره کارت درست نیست/)
    await user.clear(field(/شماره کارت/))
    await user.type(field(/شماره کارت/), '۶۰۳۷۹۹۱۲۳۴۵۶۷۸۹۳')
    await user.click(submit())
    await waitFor(() =>
      expect(withdrawalsSent(mocks.bffFetch)).toEqual([
        expect.objectContaining({ card_number: '6037991234567893' }),
      ]),
    )
  })

  it('the account holder is required; when it is paid is said', async () => {
    const { user } = renderForm()
    expect(screen.getByText(/ظرف ۳ روز کاری/)).toBeVisible()
    await user.type(field(/مبلغ برداشت/), '300000')
    await user.click(field(/شماره شبا/))
    await user.paste(SHEBA)
    await user.click(submit())
    expect(field(/نام صاحب حساب/)).toHaveAccessibleDescription(/نام صاحب حساب را وارد کنید/)
    expect(field(/نام صاحب حساب/)).toHaveFocus()
  })
})

describe('the API’s answers', () => {
  it('201: one request however fast the presses; the request goes to the page', async () => {
    let answer: (value: unknown) => void = () => {}
    const { user, onFiled } = renderForm(() => new Promise((resolve) => (answer = resolve)))
    await fill(user)
    await user.dblClick(submit())
    expect(withdrawalsSent(mocks.bffFetch)).toHaveLength(1)
    answer({
      data: withdrawal({ status: 'requested', bank_name: 'بانک ملت' }),
      msg: '',
      status: 201,
    })
    await waitFor(() => expect(onFiled).toHaveBeenCalledTimes(1))
  })

  it.each([
    ['wd-iban-invalid', /شماره شبا/, 'شماره شبا معتبر نیست.'],
    ['wd-card-invalid', /شماره کارت/, 'شماره کارت معتبر نیست.'],
  ] as const)('live %s: under its field', async (name, label, text) => {
    const { user } = renderForm(() => refuseLive(name))
    await fill(user)
    if (name === 'wd-card-invalid') await user.type(field(/شماره کارت/), '6037991234567893')
    await user.click(submit())
    await waitFor(() => expect(field(label)).toHaveAccessibleDescription(new RegExp(text)))
  })

  it('live below the minimum: the wallet read again, its fresh minimum said on the amount', async () => {
    const fresh = balance({ minimum_withdrawal_amount: 500_000 })
    const { user, refreshWallet } = renderForm(() => refuseLive('wd-below'), fresh)
    await fill(user)
    await user.click(submit())
    await waitFor(() =>
      expect(field(/مبلغ برداشت/)).toHaveAccessibleDescription(
        /حداقل مبلغ برداشت ۵۰۰٬۰۰۰ تومان است/,
      ),
    )
    expect(refreshWallet).toHaveBeenCalledTimes(1)
  })

  it('below the minimum, the wallet not read again: the API’s own sentence', async () => {
    const { user } = renderForm(() => refuseLive('wd-below'), null)
    await fill(user)
    await user.click(submit())
    await waitFor(() =>
      expect(field(/مبلغ برداشت/)).toHaveAccessibleDescription(
        /مبلغ برداشت نمی‌تواند کمتر از ۲۰۰٬۰۰۰ تومان باشد\./,
      ),
    )
  })

  it('409 one open request already: the page shows it (with its cancel)', async () => {
    const { user, onPendingExists } = renderForm(() =>
      refuse(409, 'wallet_withdrawal_pending_exists', 'یک درخواست برداشت در حال بررسی دارید.'),
    )
    await fill(user)
    await user.click(submit())
    await waitFor(() => expect(onPendingExists).toHaveBeenCalledTimes(1))
  })

  it('withdrawals switched off by the shop: the form goes, with why', async () => {
    const { user, onClosed } = renderForm(() =>
      refuse(400, 'wallet_withdrawal_disabled', 'برداشت غیرفعال است.'),
    )
    await fill(user)
    await user.click(submit())
    await waitFor(() => expect(onClosed).toHaveBeenCalledWith('برداشت غیرفعال است.'))
  })

  it.each([['wd-over-balance', 'موجودی کیف پول شما برای این تراکنش کافی نیست.']] as const)(
    'live %s: said on the amount; the balance read again',
    async (name, text) => {
      const { user, client } = renderForm(() => refuseLive(name))
      client.setQueryData(['wallet', 'balance'], balance())
      await fill(user)
      await user.click(submit())
      await waitFor(() =>
        expect(field(/مبلغ برداشت/)).toHaveAccessibleDescription(new RegExp(text)),
      )
      expect(client.getQueryState(['wallet', 'balance'])?.isInvalidated).toBe(true)
    },
  )

  it('a frozen wallet (403), a lost answer: said for the whole form', async () => {
    const { user } = renderForm(() => refuse(403, 'wallet_frozen', 'کیف پول مسدود است.'))
    await fill(user)
    await user.click(submit())
    expect(await screen.findByRole('alert')).toHaveTextContent('کیف پول مسدود است.')
  })

  it('429 (five an hour): the wait on the button; nothing sent meanwhile', async () => {
    const { user } = renderForm(() => refuse(429, 'throttled', 'زیاد', { retry_after: 600 }))
    await fill(user)
    await user.click(submit())
    expect(await screen.findByText(/زمان باقی‌مانده تا تلاش دوباره/)).toBeVisible()
    await user.click(submit())
    expect(withdrawalsSent(mocks.bffFetch)).toHaveLength(1)
  })
})
