import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TopUpForm } from '@/features/wallet/top-up-form'
import type { WalletBalance } from '@/lib/api/types/payment'
import { catalog } from '../payment/fixtures'
import { stubBrowserApis } from '../support/dom-stubs'
import { balance } from './fixtures'
import {
  ok,
  refuse,
  refuseLive,
  renderWallet,
  serve,
  topUpIntent,
  topUpKeys,
  topUpSent,
  type Route,
} from './wallet-support'

// Every refusal of `POST wallet/top-up/` (order digest §3.3.3, §8.3, §8.5), the live ones from
// the dev backend: the bound said from the wallet read again, the box gone when top-ups are off
// or the bank cannot be used (the support line), the freeze message, a gateway the server calls
// unknown left out for the page, waits, and the same key only while the press is still starting.
// The dev backend refuses every bank: nothing navigates.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), goToBank: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/features/payment/go-to-bank', () => ({ goToBank: mocks.goToBank }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/account/wallet/',
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  stubBrowserApis()
  localStorage.clear()
})

const amount = () => screen.getByRole('textbox', { name: /مبلغ شارژ/ })
const submit = () => screen.getByRole('button', { name: /^(افزایش موجودی|در حال)/ })

async function pressWith(
  topUp: Route,
  {
    fresh = balance(),
    typed = '100000',
    wallet = balance(),
  }: { fresh?: WalletBalance; typed?: string; wallet?: WalletBalance } = {},
) {
  serve(mocks.bffFetch, {
    'wallet/top-up/': topUp,
    'payment/gateway/list/': () => new Promise(() => {}),
  })
  const refreshWallet = vi.fn(async () => fresh)
  renderWallet(
    <TopUpForm
      wallet={wallet}
      catalog={catalog()}
      supportPhone="+982191000000"
      refreshWallet={refreshWallet}
    />,
  )
  const user = userEvent.setup(vi.isFakeTimers() ? { advanceTimers: vi.advanceTimersByTime } : {})
  await user.type(amount(), typed)
  await user.click(submit())
  return { user, refreshWallet }
}

describe('the amount refused by the server', () => {
  it.each(['topup-below', 'topup-above'] as const)(
    'live %s: the wallet read again, its bound said in Persian digits',
    async (name) => {
      const fresh = balance({ minimum_top_up_amount: 200_000, maximum_top_up_amount: 300_000 })
      const { refreshWallet } = await pressWith(() => refuseLive(name), { fresh })
      expect(refreshWallet).toHaveBeenCalled()
      await waitFor(() =>
        expect(amount()).toHaveAccessibleDescription(/حداقل مبلغ شارژ ۲۰۰٬۰۰۰ تومان است\./),
      )
      expect(amount()).toHaveFocus()
    },
  )

  it('the day’s limit: what is left today, from the wallet read again', async () => {
    const fresh = balance({ remaining_daily_top_up: 60_000 })
    await pressWith(() => refuse(400, 'wallet_top_up_daily_limit_exceeded'), { fresh })
    await waitFor(() =>
      expect(amount()).toHaveAccessibleDescription(/از سقف شارژ امروز ۶۰٬۰۰۰ تومان باقی مانده است/),
    )
  })
})

describe('the box closes', () => {
  it('top-ups switched off by the shop: its sentence instead of the box', async () => {
    await pressWith(() => refuse(400, 'wallet_top_up_disabled', 'شارژ کیف پول غیرفعال است.'))
    expect(await screen.findByText('شارژ کیف پول غیرفعال است.')).toBeVisible()
    expect(screen.queryByRole('textbox', { name: /مبلغ شارژ/ })).toBeNull()
  })

  it('live gateway_not_configured: no navigation; the support line', async () => {
    await pressWith(() => refuseLive('topup-unnamed'))
    expect(await screen.findByText(/شارژ کیف پول با درگاه بانکی در این فروشگاه/)).toBeVisible()
    expect(screen.getByRole('link', { name: /پشتیبانی/ })).toHaveAttribute(
      'href',
      'tel:+982191000000',
    )
    expect(mocks.goToBank).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'افزایش موجودی' })).toBeNull()
  })

  it('a frozen wallet (403): the freeze message, said', async () => {
    await pressWith(() => refuse(403, 'wallet_frozen', 'کیف پول شما مسدود شده است.'))
    expect(await screen.findByRole('alert')).toHaveTextContent('کیف پول شما مسدود شده است.')
  })
})

describe('the gateway', () => {
  it('live gateway_unknown: that gateway left out (no repeat), the next press names the other', async () => {
    const answers: Route[] = [() => refuseLive('topup-named'), () => new Promise(() => {})]
    const { user } = await pressWith((init) => answers.shift()!(init))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'این درگاه در حال حاضر در دسترس نیست؛ برای پرداخت با زیبال دوباره «افزایش موجودی» را بزنید.',
    )
    // One gateway left: nothing to choose, its own code sent (it is not the shop's default).
    expect(screen.queryByRole('button', { name: 'تغییر درگاه' })).toBeNull()
    await user.click(submit())
    expect(topUpSent(mocks.bffFetch)).toEqual([
      { amount: 100_000, gateway_code: 'ZARINPAL' },
      { amount: 100_000, gateway_code: 'ZIBAL' },
    ])
    expect(mocks.goToBank).not.toHaveBeenCalled()
  })

  it.each([
    [503, 'gateway_unavailable', 'درگاه بانک پاسخ نداد؛ کمی بعد دوباره تلاش کنید.'],
    [502, 'gateway_rejected', 'بانک تراکنش را نپذیرفت.'],
    [409, 'payment_idempotency_conflict', 'تلاش قبلی شارژ پایان یافته است'],
    [500, 'server_error', 'رد شد.'],
  ])('%i %s: said; the box stays', async (status, code, text) => {
    await pressWith(() => refuse(status, code))
    expect(await screen.findByRole('alert')).toHaveTextContent(text)
    expect(submit()).toBeVisible()
  })
})

describe('waits and retries', () => {
  it('429: the wait on the button; a press meanwhile sends nothing', async () => {
    const { user } = await pressWith(() => refuse(429, 'throttled', 'زیاد', { retry_after: 30 }))
    expect(await screen.findByText(/زمان باقی‌مانده تا تلاش دوباره/)).toBeVisible()
    await user.click(submit())
    expect(topUpSent(mocks.bffFetch)).toHaveLength(1)
  })

  it('payment_attempt_starting: the same key again, about 2 s later; then the bank', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const answers: Route[] = [() => refuse(409, 'payment_attempt_starting'), () => topUpIntent()]
    await pressWith((init) => answers.shift()!(init))
    await act(() => vi.advanceTimersByTimeAsync(2_100))
    await waitFor(() => expect(topUpKeys(mocks.bffFetch)).toHaveLength(2))
    const [first, second] = topUpKeys(mocks.bffFetch)
    expect(second).toBe(first)
    await waitFor(() => expect(mocks.goToBank).toHaveBeenCalledTimes(1))
  })

  it('gateway_token_expired (a replayed key): one new key, a new attempt', async () => {
    const answers: Route[] = [() => refuse(410, 'gateway_token_expired'), () => topUpIntent()]
    await pressWith((init) => answers.shift()!(init))
    await waitFor(() => expect(topUpKeys(mocks.bffFetch)).toHaveLength(2))
    const [first, second] = topUpKeys(mocks.bffFetch)
    expect(second).not.toBe(first)
    expect(await screen.findByText('در حال انتقال به زرین پال…')).toBeVisible()
  })

  it('503 feature_disabled: the switch’s words; the box goes', async () => {
    await pressWith(() =>
      refuse(503, 'feature_disabled', 'پرداخت آنلاین موقتاً بسته است.', {
        feature: 'online_payment',
      }),
    )
    await waitFor(() => expect(screen.queryByRole('region', { name: 'افزایش موجودی' })).toBeNull())
  })
})

describe('sent as typed', () => {
  it('the amount in Latin digits, whatever was typed', async () => {
    await pressWith(() => ok({}), { typed: '۱۲۳٬۴۵۶' })
    expect(topUpSent(mocks.bffFetch)).toEqual([{ amount: 123_456, gateway_code: 'ZARINPAL' }])
  })
})
