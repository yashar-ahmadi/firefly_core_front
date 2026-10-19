import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Withdrawals } from '@/features/wallet/withdrawals'
import type { QueryInit } from '@/lib/api/envelope'
import type { WithdrawalRequest } from '@/lib/api/types/wallet'
import { stubBrowserApis } from '../support/dom-stubs'
import { spyOnHistory } from '../support/history'
import { balance, withdrawal, withdrawals } from './fixtures'
import { calls, ok, refuse, renderWallet } from './wallet-support'

// «برداشت» (order digest §3.3.4–3.3.6, §7, §8.5): one open request at a time, shown first with
// «لغو درخواست» while it is `requested` (a question that starts on «انصراف»; 200 → the money is
// back at once; 409 → the list read again); the requests with their status pills (words, not
// colour alone), the paid one's reference and date, the rejected one's reason; filters and the
// ordering in the URL. A new request only while the wallet allows it (the form loads on its
// button); frozen or switched off: why, the list and a cancel still there.

const mocks = vi.hoisted(() => ({
  bffFetch: vi.fn(),
  announce: vi.fn(),
  search: 'tab=withdrawals',
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/components/ui/live-announcer', () => ({ announce: mocks.announce }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/account/wallet/',
  useSearchParams: () => new URLSearchParams(mocks.search),
}))

type Init = { query?: QueryInit; method?: string }
const OPEN: WithdrawalRequest = withdrawal({
  uuid: '0a9e00aa-0000-4000-8000-0000000000aa',
  status: 'requested',
  status_display: 'در انتظار بررسی',
  reviewed_at: null,
  bank_name: 'بانک ملت',
})
let open: WithdrawalRequest | null = null
let cancel: () => Promise<unknown>
let history = spyOnHistory()

const ALL = (): WithdrawalRequest[] => [
  ...(open ? [open] : []),
  withdrawal({ uuid: 'b1', status: 'approved', status_display: 'تأیید شده' }),
  withdrawal({
    uuid: 'b2',
    status: 'rejected',
    status_display: 'رد شده',
    rejection_reason: 'شبا به نام صاحب حساب نیست.',
  }),
  ...withdrawals().results,
]

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  history = spyOnHistory()
  mocks.search = 'tab=withdrawals'
  open = null
  cancel = () => ok({ ...OPEN, status: 'cancelled', status_display: 'لغو شده' })
  mocks.bffFetch.mockImplementation((path: string, init: Init = {}) => {
    if (path === 'wallet/withdrawal/list/') {
      const statuses = init.query?.status
      if (Array.isArray(statuses)) return ok({ ...withdrawals(), results: open ? [open] : [] })
      return ok({ ...withdrawals(), count: ALL().length, results: ALL() })
    }
    if (path === `wallet/withdrawal/${OPEN.uuid}/cancel/`) return cancel()
    return new Promise(() => {})
  })
})

function renderTab(wallet = balance()) {
  const view = renderWallet(<Withdrawals wallet={wallet} />)
  return { ...view, user: userEvent.setup() }
}

const list = async () => screen.findByRole('list', { name: 'درخواست‌های برداشت' })
const row = async (text: string) =>
  within(await list())
    .getAllByRole('listitem')
    .find((item) => item.textContent?.includes(text))!

describe('the requests', () => {
  it('each with its status in words; the paid one’s reference and date; the rejected one’s reason', async () => {
    renderTab()
    const paid = await row('پرداخت شده')
    expect(paid).toHaveTextContent('۵٬۰۰۰٬۰۰۰ تومان')
    expect(paid).toHaveTextContent(/شمارهٔ پیگیری واریز:?\s*۳۷۴۵۳۰۹۸۳۰/)
    expect(paid).toHaveTextContent('بانک ملت')
    expect(await row('رد شده')).toHaveTextContent('شبا به نام صاحب حساب نیست.')
    expect(await row('لغو شده')).toHaveTextContent('IR۰۶ ۲۹۶۰ ۰۰۰۰ ۰۰۱۰ ۰۳۲۴ ۲۰۰۰ ۰۱')
    expect(await row('تأیید شده')).toBeVisible()
  })

  it('a status filter and the ordering: the URL’s, in the API’s names (unknown ones never sent)', async () => {
    mocks.search = 'tab=withdrawals&status=paid&ordering=amount&page=2'
    const { user } = renderTab()
    await list()
    const queries = calls(mocks.bffFetch, 'wallet/withdrawal/list/').map(
      ([, init]) => (init as Init).query,
    )
    expect(queries).toContainEqual({ status: 'paid', ordering: 'amount', page: 2 })
    await user.selectOptions(screen.getByRole('combobox', { name: 'وضعیت' }), 'rejected')
    expect(history.replaced().at(-1)).toBe(
      '/account/wallet/?tab=withdrawals&status=rejected&ordering=amount',
    )
  })
})

describe('the open request', () => {
  it('shown first, with «لغو درخواست»; no new request offered meanwhile', async () => {
    open = OPEN
    renderTab()
    const card = await screen.findByRole('region', { name: 'درخواست برداشت باز' })
    expect(card).toHaveTextContent('در انتظار بررسی')
    expect(card).toHaveTextContent('بانک ملت')
    expect(within(card).getByRole('button', { name: 'لغو درخواست' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'درخواست برداشت جدید' })).toBeNull()
  })

  it('cancelled: the question starts on «انصراف»; 200: the money back, said; the wallet read again', async () => {
    open = OPEN
    const { user, client } = renderTab()
    client.setQueryData(['wallet', 'balance'], balance())
    await user.click(await screen.findByRole('button', { name: 'لغو درخواست' }))
    const dialog = await screen.findByRole('dialog', { name: 'لغو درخواست برداشت' })
    expect(within(dialog).getByRole('button', { name: 'انصراف' })).toHaveFocus()
    expect(dialog).toHaveTextContent('۳۰۰٬۰۰۰ تومان')
    // Held while three presses come: one request.
    let answer: (value: unknown) => void = () => {}
    cancel = () => new Promise((resolve) => (answer = resolve))
    const confirm = within(dialog).getByRole('button', { name: 'لغو درخواست' })
    await user.dblClick(confirm)
    await user.click(confirm)
    expect(calls(mocks.bffFetch, `wallet/withdrawal/${OPEN.uuid}/cancel/`)).toHaveLength(1)
    answer({
      data: { ...OPEN, status: 'cancelled', status_display: 'لغو شده' },
      msg: '',
      status: 200,
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(mocks.announce).toHaveBeenCalledWith(expect.stringContaining('به کیف پول شما برگشت'))
    expect(client.getQueryState(['wallet', 'balance'])?.isInvalidated).toBe(true)
  })

  it('409 not cancellable any more (reviewed meanwhile): said, the list read again', async () => {
    open = OPEN
    cancel = () =>
      refuse(409, 'wallet_withdrawal_not_cancellable', 'این درخواست برداشت دیگر قابل لغو نیست.')
    const { user } = renderTab()
    await user.click(await screen.findByRole('button', { name: 'لغو درخواست' }))
    const dialog = await screen.findByRole('dialog', { name: 'لغو درخواست برداشت' })
    const before = calls(mocks.bffFetch, 'wallet/withdrawal/list/').length
    await user.click(within(dialog).getByRole('button', { name: 'لغو درخواست' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('دیگر قابل لغو نیست')
    expect(within(dialog).queryByRole('button', { name: 'لغو درخواست' })).toBeNull()
    await waitFor(() =>
      expect(calls(mocks.bffFetch, 'wallet/withdrawal/list/').length).toBeGreaterThan(before),
    )
  })

  it('cancelled: the focus goes to the requests’ heading (never <body>)', async () => {
    open = OPEN
    const { user } = renderTab()
    await user.click(await screen.findByRole('button', { name: 'لغو درخواست' }))
    const dialog = await screen.findByRole('dialog', { name: 'لغو درخواست برداشت' })
    open = null
    await user.click(within(dialog).getByRole('button', { name: 'لغو درخواست' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'درخواست‌های برداشت' })).toHaveFocus(),
    )
  })

  it('approved: under way at the bank, no cancel', async () => {
    open = { ...OPEN, status: 'approved', status_display: 'تأیید شده' }
    renderTab()
    const card = await screen.findByRole('region', { name: 'درخواست برداشت باز' })
    expect(within(card).queryByRole('button', { name: 'لغو درخواست' })).toBeNull()
  })
})

describe('a new request', () => {
  it('no open one: «درخواست برداشت جدید» loads the form', async () => {
    const { user } = renderTab()
    await user.click(await screen.findByRole('button', { name: 'درخواست برداشت جدید' }))
    expect(await screen.findByRole('textbox', { name: /شماره شبا/ })).toBeVisible()
  })

  it('frozen: why no new request; the list stays', async () => {
    renderTab(balance({ is_frozen: true, freeze_message: 'مسدود.' }))
    // Said only without an open request: nothing about cancelling one that is not shown.
    expect(
      await screen.findByText('کیف پول شما مسدود است؛ درخواست برداشت تازه ممکن نیست.'),
    ).toBeVisible()
    expect(screen.queryByText(/لغو همچنان ممکن است/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'درخواست برداشت جدید' })).toBeNull()
    expect(await list()).toBeVisible()
  })

  it('withdrawals off at the shop (`is_withdrawal_enabled` false): no form, said', async () => {
    renderTab(balance({ is_withdrawal_enabled: false }))
    expect(
      await screen.findByText(/ثبت درخواست برداشت از کیف پول در حال حاضر ممکن نیست/),
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: 'درخواست برداشت جدید' })).toBeNull()
  })
})

describe('from a ledger row (`focus`)', () => {
  it('its request takes the focus; one not on the page is said', async () => {
    mocks.search = `tab=withdrawals&focus=${withdrawals().results[0]!.uuid}`
    const { unmount } = renderTab()
    await waitFor(() => expect(document.activeElement?.textContent).toContain('لغو شده'))
    unmount()
    mocks.search = 'tab=withdrawals&focus=0a9e0fff-0000-4000-8000-000000000fff'
    renderTab()
    expect(await screen.findByText(/این درخواست برداشت در این صفحه نیست/)).toBeVisible()
  })
})
