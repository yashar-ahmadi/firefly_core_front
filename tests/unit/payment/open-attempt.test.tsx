import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OpenAttempt, type OpenAttemptProps } from '@/features/payment/open-attempt'
import { getPending } from '@/features/payment/pending-payments'
import { ApiError } from '@/lib/api/errors'
import type { OpenAttempt as Attempt } from '@/lib/api/types/payment'
import cancelled from '../../fixtures/payment-attempt-cancel.json'
import { clientProviders } from '../support/providers'
import { handoff, LINK_TOKEN, PAYMENT_UUID } from './fixtures'
import {
  bankAttempt,
  cardAttempt,
  expiredAttempt,
  reviewAttempt,
  verifyingAttempt,
} from './link-fixtures'

// The open-attempt resume UI (order digest §5.9; Review Focus #2): exactly the table's rows.
// A bank handoff still valid → «ادامه در {gateway}» (the pending payment saved first) or
// «انصراف»; an expired handoff → «انصراف و پرداخت دوباره»; a verification running → wait (its
// status read now and then), never the bank; a card transfer → its page or «انصراف»; a receipt
// under review → wait. «انصراف» cancels the attempt (`POST payment/<uuid>/cancel/`) and hands
// the order back to its host, which pays again with a new key.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), goToBank: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/features/payment/go-to-bank', () => ({ goToBank: mocks.goToBank }))

const CANCEL = `payment/${PAYMENT_UUID}/cancel/`
const STATUS = `payment/${PAYMENT_UUID}/status/`
const DOOR = { kind: 'link', token: LINK_TOKEN } as const

beforeEach(() => {
  mocks.bffFetch.mockReset()
  mocks.goToBank.mockReset()
  localStorage.clear()
  // The status of a verification: still pending (it never resolves within a test).
  mocks.bffFetch.mockImplementation((path: string) =>
    path === CANCEL
      ? Promise.resolve({ data: cancelled.data, msg: cancelled.msg, status: 200 })
      : new Promise(() => {}),
  )
})

function show(attempt: Attempt, props: Partial<OpenAttemptProps> = {}) {
  const onResolved = vi.fn()
  const { wrapper } = clientProviders()
  render(
    <OpenAttempt
      attempt={attempt}
      door={DOOR}
      orderCode="1411635340"
      onResolved={onResolved}
      {...props}
    />,
    { wrapper },
  )
  return { onResolved, panel: screen.getByRole('region', { name: /پرداخت/ }) }
}

const cancels = () => mocks.bffFetch.mock.calls.filter(([path]) => path === CANCEL)

describe('a bank attempt whose handoff is still valid', () => {
  it('«ادامه در …» saves the pending payment first, then goes to the bank (once)', async () => {
    const user = userEvent.setup()
    let savedFirst = false
    mocks.goToBank.mockImplementation(() => {
      savedFirst = getPending(PAYMENT_UUID) !== null
    })
    const { panel } = show(bankAttempt())
    expect(panel).toHaveTextContent('یک پرداخت نیمه\u{200C}تمام دارید')
    const go = within(panel).getByRole('button', { name: 'ادامه در زرین پال' })
    await user.dblClick(go)
    await waitFor(() => expect(mocks.goToBank).toHaveBeenCalledTimes(1))
    expect(mocks.goToBank).toHaveBeenCalledWith(handoff())
    expect(savedFirst).toBe(true)
    expect(getPending(PAYMENT_UUID)).toMatchObject({
      kind: 'order',
      orderCode: '1411635340',
      linkToken: LINK_TOKEN,
      route: 'bank_gateway',
      amount: 1_049_000,
    })
    expect(mocks.bffFetch).not.toHaveBeenCalled()
  })

  it('«انصراف» cancels the attempt once and gives the order back (no payment yet)', async () => {
    const user = userEvent.setup()
    const { panel, onResolved } = show(bankAttempt())
    // Switching away sends a «payment failed» SMS (digest §3.2.6): said before the press.
    expect(panel).toHaveTextContent('پیامک')
    await user.dblClick(within(panel).getByRole('button', { name: 'انصراف' }))
    await waitFor(() =>
      expect(onResolved).toHaveBeenCalledWith({ kind: 'cancelled', repay: false }),
    )
    expect(cancels()).toHaveLength(1)
    expect(cancels()[0]![1]).toMatchObject({ method: 'POST' })
  })
})

describe('a bank attempt whose handoff expired', () => {
  it('shows «انصراف و پرداخت دوباره»: cancelled, then handed back to pay again', async () => {
    const user = userEvent.setup()
    const { panel, onResolved } = show(expiredAttempt())
    expect(within(panel).queryByRole('button', { name: /ادامه در/ })).not.toBeInTheDocument()
    await user.click(within(panel).getByRole('button', { name: 'انصراف و پرداخت دوباره' }))
    await waitFor(() => expect(onResolved).toHaveBeenCalledWith({ kind: 'cancelled', repay: true }))
    expect(cancels()).toHaveLength(1)
    expect(mocks.goToBank).not.toHaveBeenCalled()
  })
})

describe('a verification running', () => {
  it('waits, reads the status, never sends to the bank; cancelling warns about a parked capture', async () => {
    const { panel } = show(verifyingAttempt())
    expect(panel).toHaveTextContent('پرداخت قبلی در حال بررسی است')
    expect(within(panel).queryByRole('button', { name: /ادامه در/ })).not.toBeInTheDocument()
    expect(panel).toHaveTextContent('خودبه\u{200C}خود برنمی\u{200C}گردد')
    expect(within(panel).getByRole('button', { name: 'انصراف' })).toBeEnabled()
    await waitFor(() => expect(mocks.bffFetch).toHaveBeenCalledWith(STATUS, expect.anything()))
  })

  it('a parked capture’s cancellation says the shop has the money (never «pay again»)', async () => {
    const user = userEvent.setup()
    const parked =
      'این تلاش بسته شد. مبلغی که بانک برای آن برداشته روی سفارش ثبت نشده و فروشگاه آن را پیگیری می\u{200C}کند.'
    mocks.bffFetch.mockImplementation((path: string) =>
      path === CANCEL
        ? Promise.resolve({ data: cancelled.data, msg: parked, status: 200 })
        : new Promise(() => {}),
    )
    const { panel, onResolved } = show(verifyingAttempt())
    await user.click(within(panel).getByRole('button', { name: 'انصراف' }))
    await waitFor(() =>
      expect(onResolved).toHaveBeenCalledWith({ kind: 'cancelled', repay: false, notice: parked }),
    )
  })
})

describe('a card transfer', () => {
  it('leads to its page (a full page load: the uuid is in the URL) or cancels', async () => {
    const user = userEvent.setup()
    const { panel, onResolved } = show(cardAttempt())
    const link = within(panel).getByRole('link', { name: /کارت به کارت/ })
    expect(link).toHaveAttribute('href', `/payment/card-transfer/${PAYMENT_UUID}/`)
    expect(panel).toHaveTextContent('۱٬۰۴۹٬۰۰۰ تومان')
    await user.click(within(panel).getByRole('button', { name: 'انصراف' }))
    await waitFor(() =>
      expect(onResolved).toHaveBeenCalledWith({ kind: 'cancelled', repay: false }),
    )
  })
})

describe('a receipt under review', () => {
  it('only waits: no cancel, no payment', () => {
    const { panel } = show(reviewAttempt())
    expect(panel).toHaveTextContent('رسید در حال بررسی است')
    expect(within(panel).queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('a cancellation the server refuses', () => {
  it('payment_under_review: the receipt is said to be under review', async () => {
    const user = userEvent.setup()
    mocks.bffFetch.mockRejectedValue(
      new ApiError({ status: 409, code: 'payment_under_review', detail: 'رسید در صف بررسی است.' }),
    )
    const { panel, onResolved } = show(cardAttempt())
    await user.click(within(panel).getByRole('button', { name: 'انصراف' }))
    await waitFor(() => expect(panel).toHaveTextContent('رسید در حال بررسی است'))
    expect(within(panel).queryByRole('button', { name: 'انصراف' })).not.toBeInTheDocument()
    expect(onResolved).not.toHaveBeenCalled()
  })

  it.each(['payment_target_invalid', 'payment_not_found'])(
    '%s: the attempt is not open any more; the order is read again',
    async (code) => {
      const user = userEvent.setup()
      mocks.bffFetch.mockRejectedValue(new ApiError({ status: 400, code, detail: 'نامعتبر.' }))
      const { panel, onResolved } = show(bankAttempt())
      await user.click(within(panel).getByRole('button', { name: 'انصراف' }))
      await waitFor(() => expect(onResolved).toHaveBeenCalledWith({ kind: 'ended' }))
    },
  )

  it('payment_forbidden (another account’s attempt): explained with a way out, never re-offered', async () => {
    const user = userEvent.setup()
    mocks.bffFetch.mockRejectedValue(
      new ApiError({ status: 403, code: 'payment_forbidden', detail: 'اجازه ندارید.' }),
    )
    const { panel, onResolved } = show(expiredAttempt())
    await user.click(within(panel).getByRole('button', { name: 'انصراف و پرداخت دوباره' }))
    const alert = await within(panel).findByRole('alert')
    expect(alert).toHaveTextContent('حساب کاربری دیگری')
    expect(alert).toHaveTextContent('بدون ورود')
    expect(within(panel).queryByRole('button', { name: /انصراف/ })).not.toBeInTheDocument()
    expect(cancels()).toHaveLength(1)
    expect(onResolved).not.toHaveBeenCalled()
  })

  it('a lost answer: said, and «انصراف» can be pressed again', async () => {
    const user = userEvent.setup()
    mocks.bffFetch.mockRejectedValueOnce(ApiError.network())
    const { panel } = show(bankAttempt())
    await user.click(within(panel).getByRole('button', { name: 'انصراف' }))
    expect(await within(panel).findByRole('alert')).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'انصراف' })).toBeEnabled()
  })
})
