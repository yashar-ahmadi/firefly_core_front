import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PENDING_KEY } from '@/features/payment/pending-payments'
import { TopUpForm } from '@/features/wallet/top-up-form'
import { stubBrowserApis } from '../support/dom-stubs'
import { catalog, gateways } from '../payment/fixtures'
import { balance } from './fixtures'
import { renderWallet, topUpIntent, topUpKeys, topUpSent } from './wallet-support'

// The top-up box (order digest §3.3.1, §3.3.3, §5.12): shown only while the wallet takes top-ups
// (`is_top_up_enabled`, not frozen, the `wallet` and `online_payment` switches on); preset chips
// inside the bounds and a custom amount typed in any digits, grouped as typed; the bounds said in
// Persian digits and checked before anything is sent; a gateway chooser when more than one
// gateway is listed. A press sends one top-up with a new Idempotency-Key, and the pending
// payment is saved BEFORE the browser goes to the bank («در حال انتقال به …»).

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), goToBank: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/features/payment/go-to-bank', () => ({ goToBank: mocks.goToBank }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/account/wallet/',
}))

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  localStorage.clear()
  mocks.bffFetch.mockImplementation(() => new Promise(() => {}))
})

const amount = () => screen.getByRole('textbox', { name: /مبلغ شارژ/ })
const submit = () => screen.getByRole('button', { name: /^(افزایش موجودی|در حال)/ })

function renderForm(wallet = balance(), served = catalog()) {
  const view = renderWallet(<TopUpForm wallet={wallet} catalog={served} supportPhone={null} />)
  return { ...view, user: userEvent.setup() }
}

describe('when it shows', () => {
  it('hidden while the wallet is frozen (Review Focus #5)', () => {
    renderForm(balance({ is_frozen: true, freeze_message: 'مسدود است.' }))
    expect(screen.queryByRole('region', { name: 'افزایش موجودی' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: /مبلغ شارژ/ })).toBeNull()
  })

  it('hidden while top-ups are off, or a switch it needs is off', () => {
    const { unmount } = renderForm(balance({ is_top_up_enabled: false }))
    expect(screen.queryByRole('region', { name: 'افزایش موجودی' })).toBeNull()
    unmount()
    for (const key of ['wallet', 'online_payment'] as const) {
      const off = renderWallet(
        <TopUpForm wallet={balance()} catalog={catalog()} supportPhone={null} />,
        { features: { [key]: { key, enabled: false, reason: 'خاموش' } } },
      )
      expect(screen.queryByRole('region', { name: 'افزایش موجودی' })).toBeNull()
      off.unmount()
    }
  })

  it('shown otherwise, with its bounds in Persian digits', () => {
    renderForm()
    expect(screen.getByRole('region', { name: 'افزایش موجودی' })).toBeVisible()
    expect(amount()).toHaveAccessibleDescription(/حداقل ۵۰٬۰۰۰ تومان و حداکثر ۵۰٬۰۰۰٬۰۰۰ تومان/)
  })
})

describe('the amount', () => {
  it('rejects an amount below `minimum_top_up_amount` with the bound in Persian digits', async () => {
    const { user } = renderForm()
    await user.type(amount(), '۴۰۰۰۰')
    await user.click(submit())
    expect(amount()).toHaveAccessibleDescription(/حداقل مبلغ شارژ ۵۰٬۰۰۰ تومان است\./)
    expect(amount()).toHaveAttribute('aria-invalid', 'true')
    expect(amount()).toHaveFocus()
    expect(topUpSent(mocks.bffFetch)).toHaveLength(0)
  })

  it('the presets inside the bounds only; a chip fills the amount', async () => {
    const { user } = renderForm(balance({ remaining_daily_top_up: 700_000 }))
    const chips = within(screen.getByRole('group', { name: 'مبلغ‌های پیشنهادی' }))
    expect(chips.getAllByRole('button').map((chip) => chip.textContent)).toEqual([
      '۱۰۰٬۰۰۰ تومان',
      '۵۰۰٬۰۰۰ تومان',
    ])
    await user.click(chips.getByRole('button', { name: '۵۰۰٬۰۰۰ تومان' }))
    expect(amount()).toHaveValue('۵۰۰٬۰۰۰')
    expect(chips.getByRole('button', { name: '۵۰۰٬۰۰۰ تومان' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('typed in any digits, grouped in Persian digits as typed', async () => {
    const { user } = renderForm()
    await user.type(amount(), '1500000')
    expect(amount()).toHaveValue('۱٬۵۰۰٬۰۰۰')
    await user.clear(amount())
    await user.type(amount(), '٢٥٠٠٠٠')
    expect(amount()).toHaveValue('۲۵۰٬۰۰۰')
  })

  it('over the day’s rest: refused here, saying what is left today', async () => {
    const { user } = renderForm(balance({ remaining_daily_top_up: 700_000 }))
    await user.type(amount(), '800000')
    await user.click(submit())
    expect(amount()).toHaveAccessibleDescription(/از سقف شارژ امروز ۷۰۰٬۰۰۰ تومان باقی مانده است/)
    expect(topUpSent(mocks.bffFetch)).toHaveLength(0)
  })
})

describe('the gateway', () => {
  it('more than one gateway: the default named, Task 3’s chooser one press away (its own chunk)', async () => {
    const { user } = renderForm()
    expect(screen.getByRole('region', { name: 'افزایش موجودی' })).toHaveTextContent(
      /درگاه پرداخت:\s*زرین پال/,
    )
    const change = screen.getByRole('button', { name: 'تغییر درگاه' })
    expect(change).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('radiogroup')).toBeNull()
    await user.click(change)
    expect(change).toHaveAttribute('aria-expanded', 'true')
    const chooser = await screen.findByRole('radiogroup', { name: 'درگاه بانکی را انتخاب کنید' })
    expect(within(chooser).getByRole('radio', { name: 'زرین پال' })).toBeChecked()
  })

  it('none with a single gateway (the server’s default: no code sent)', async () => {
    mocks.bffFetch.mockImplementation(() => topUpIntent())
    const { user } = renderForm(balance(), catalog({ gateways: [gateways()[0]!] }))
    expect(screen.queryByRole('button', { name: 'تغییر درگاه' })).toBeNull()
    await user.type(amount(), '100000')
    await user.click(submit())
    await waitFor(() => expect(topUpSent(mocks.bffFetch)).toEqual([{ amount: 100_000 }]))
  })
})

describe('when the bounds are empty', () => {
  it('the day’s rest under the shop’s floor: closed for today', () => {
    renderForm(balance({ remaining_daily_top_up: 20_000 }))
    expect(screen.getByRole('region', { name: 'افزایش موجودی' })).toHaveTextContent(
      /از سقف شارژ امروز فقط ۲۰٬۰۰۰ تومان باقی مانده/,
    )
    expect(screen.queryByRole('button', { name: 'تغییر درگاه' })).toBeNull()
  })

  it('the chosen gateway’s own range: not closed; its range said, «تغییر درگاه» kept', async () => {
    const [zarinpal, zibal] = gateways()
    const served = catalog({ gateways: [{ ...zarinpal!, minimum_amount: 200_000 }, zibal!] })
    const { user } = renderForm(balance({ remaining_daily_top_up: 100_000 }), served)
    const box = screen.getByRole('region', { name: 'افزایش موجودی' })
    expect(box).not.toHaveTextContent(/سقف شارژ امروز/)
    expect(within(box).getByRole('status')).toHaveTextContent(
      'پرداخت با زرین پال از ۲۰۰٬۰۰۰ تومان ممکن است، اما شارژ کیف پول اکنون از ۵۰٬۰۰۰ تومان تا ۱۰۰٬۰۰۰ تومان است؛ درگاه دیگری را انتخاب کنید.',
    )
    expect(screen.queryByRole('textbox', { name: /مبلغ شارژ/ })).toBeNull()
    // Another gateway: the amount and its bounds come back.
    await user.click(within(box).getByRole('button', { name: 'تغییر درگاه' }))
    await user.click(await screen.findByRole('radio', { name: 'زیبال' }))
    expect(amount()).toHaveAccessibleDescription(/حداقل ۵۰٬۰۰۰ تومان و حداکثر ۱۰۰٬۰۰۰ تومان/)
  })

  it('the only gateway’s range: closed, its range said', () => {
    const served = catalog({ gateways: [{ ...gateways()[0]!, maximum_amount: 20_000 }] })
    renderForm(balance(), served)
    expect(screen.getByRole('region', { name: 'افزایش موجودی' })).toHaveTextContent(
      'پرداخت با زرین پال از ۱۰٬۰۰۰ تومان تا ۲۰٬۰۰۰ تومان ممکن است، اما شارژ کیف پول اکنون از ۵۰٬۰۰۰ تومان تا ۵۰٬۰۰۰٬۰۰۰ تومان است؛ شارژ با این درگاه ممکن نیست.',
    )
    expect(screen.queryByRole('textbox', { name: /مبلغ شارژ/ })).toBeNull()
  })
})

describe('the press', () => {
  it('one top-up however fast the presses, with the chosen gateway', async () => {
    mocks.bffFetch.mockImplementation(() => new Promise(() => {}))
    const { user } = renderForm()
    await user.click(screen.getByRole('button', { name: 'تغییر درگاه' }))
    await user.click(await screen.findByRole('radio', { name: 'زیبال' }))
    await user.type(amount(), '100000')
    await user.dblClick(submit())
    await user.click(submit())
    expect(topUpSent(mocks.bffFetch)).toEqual([{ amount: 100_000, gateway_code: 'ZIBAL' }])
    expect(submit()).toHaveAttribute('aria-busy', 'true')
  })

  it('saves the pending top-up BEFORE the bank, then says where it goes', async () => {
    let pendingAtBank: unknown = null
    mocks.goToBank.mockImplementation(() => {
      pendingAtBank = JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null')
    })
    mocks.bffFetch.mockImplementation(() => topUpIntent(250_000))
    const { user } = renderForm()
    await user.type(amount(), '250000')
    await user.click(submit())
    expect(await screen.findByText('در حال انتقال به زرین پال…')).toBeVisible()
    await waitFor(() => expect(mocks.goToBank).toHaveBeenCalledTimes(1))
    expect(pendingAtBank).toEqual({
      '0b6f5a9e-3c1d-4f7a-9e2b-1a2b3c4d5e6f': {
        kind: 'topup',
        route: 'bank_gateway',
        amount: 250_000,
        startedAt: expect.any(Number),
      },
    })
  })

  it('a new Idempotency-Key for every press (a refusal in between)', async () => {
    mocks.bffFetch.mockImplementation(() =>
      Promise.reject(
        Object.assign(new Error('x'), { name: 'TypeError' }), // a lost answer
      ),
    )
    const { user } = renderForm()
    await user.type(amount(), '100000')
    await user.click(submit())
    await screen.findByRole('alert')
    await user.click(submit())
    await waitFor(() => expect(topUpKeys(mocks.bffFetch)).toHaveLength(2))
    const [first, second] = topUpKeys(mocks.bffFetch)
    expect(first).toMatch(/^[\w-]{8,64}$/)
    expect(second).not.toBe(first)
  })
})
