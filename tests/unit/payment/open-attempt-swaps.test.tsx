import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OpenAttempt } from '@/features/payment/open-attempt'
import { ApiError } from '@/lib/api/errors'
import type { OpenAttempt as Attempt } from '@/lib/api/types/payment'
import cancelled from '../../fixtures/payment-attempt-cancel.json'
import { clientProviders } from '../support/providers'
import { handoff, LINK_TOKEN, PAYMENT_UUID } from './fixtures'
import { bankAttempt, cardAttempt, verifyingAttempt } from './link-fixtures'

// The open-attempt panel when it changes under the shopper (order digest §5.9): a verification
// that ends hands the order back (settled, or closed); a handoff whose time is up turns the bank
// row into «انصراف و پرداخت دوباره»; a refused cancellation turns the row into the receipt's
// wait. Each swap is said politely, and when the focused control went away the focus goes to the
// panel's heading (never taken from elsewhere). A cancellation is said before the host takes over.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), announce: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/features/payment/go-to-bank', () => ({ goToBank: vi.fn() }))
vi.mock('@/components/ui/live-announcer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ui/live-announcer')>()),
  announce: mocks.announce,
}))

const STATUS = `payment/${PAYMENT_UUID}/status/`
const CANCEL = `payment/${PAYMENT_UUID}/cancel/`

beforeEach(() => {
  mocks.bffFetch.mockReset()
  mocks.announce.mockReset()
  localStorage.clear()
})

function show(attempt: Attempt) {
  const onResolved = vi.fn()
  const { wrapper } = clientProviders()
  render(
    <OpenAttempt
      attempt={attempt}
      door={{ kind: 'link', token: LINK_TOKEN }}
      onResolved={onResolved}
    />,
    { wrapper },
  )
  const panel = screen.getByRole('region', { name: 'پرداخت باز این سفارش' })
  return { onResolved, panel, heading: within(panel).getByRole('heading') }
}

const status = (value: string) =>
  Promise.resolve({ data: { ...cancelled.data, status: value }, msg: '', status: 200 })

describe('a verification that ends', () => {
  it.each([
    ['settled', { kind: 'settled' }],
    ['failed', { kind: 'ended' }],
    ['cancelled', { kind: 'ended' }],
  ])('%s: handed back to the host', async (value, resolution) => {
    mocks.bffFetch.mockImplementation((path: string) =>
      path === STATUS ? status(value) : new Promise(() => {}),
    )
    const { onResolved } = show(verifyingAttempt())
    await waitFor(() => expect(onResolved).toHaveBeenCalledWith(resolution))
  })
})

describe('a handoff whose time is up', () => {
  it('turns the bank row into «انصراف و پرداخت دوباره», said; the focus follows', async () => {
    const user = userEvent.setup()
    mocks.bffFetch.mockImplementation(() => new Promise(() => {}))
    const soon = new Date(Date.now() + 1_500).toISOString()
    const { panel, heading } = show(bankAttempt({ handoff: handoff({ expires_at: soon }) }))
    await user.click(within(panel).getByRole('button', { name: 'ادامه در زرین پال' }))
    // The focus was in the panel (its pressed button, still busy): it moves to the heading.
    await within(panel).findByRole('button', { name: 'انصراف و پرداخت دوباره' }, { timeout: 4000 })
    expect(within(panel).queryByRole('button', { name: /ادامه در/ })).not.toBeInTheDocument()
    expect(mocks.announce).toHaveBeenCalledWith(expect.stringContaining('مهلت انتقال به درگاه'))
    expect(heading).toHaveFocus()
  })

  it('never takes the focus from elsewhere on the page', async () => {
    mocks.bffFetch.mockImplementation(() => new Promise(() => {}))
    const soon = new Date(Date.now() + 1_500).toISOString()
    const { panel } = show(bankAttempt({ handoff: handoff({ expires_at: soon }) }))
    const outside = document.createElement('button')
    document.body.append(outside)
    outside.focus()
    await within(panel).findByRole('button', { name: 'انصراف و پرداخت دوباره' }, { timeout: 4000 })
    expect(outside).toHaveFocus()
    outside.remove()
  })
})

describe('a cancellation', () => {
  it('refused, a receipt under review: said, the focus on the heading', async () => {
    const user = userEvent.setup()
    mocks.bffFetch.mockRejectedValue(
      new ApiError({ status: 409, code: 'payment_under_review', detail: 'رسید در صف است.' }),
    )
    const { panel, heading } = show(cardAttempt())
    await user.click(within(panel).getByRole('button', { name: 'انصراف' }))
    await waitFor(() => expect(heading).toHaveTextContent('رسید در حال بررسی است'))
    expect(heading).toHaveFocus()
    expect(mocks.announce).toHaveBeenCalledWith(expect.stringContaining('امکان انصراف نیست'))
  })

  it('done: said before the host takes over', async () => {
    const user = userEvent.setup()
    mocks.bffFetch.mockImplementation((path: string) =>
      path === CANCEL
        ? Promise.resolve({ data: cancelled.data, msg: cancelled.msg, status: 200 })
        : new Promise(() => {}),
    )
    const { panel, onResolved } = show(bankAttempt())
    await user.click(within(panel).getByRole('button', { name: 'انصراف' }))
    await waitFor(() => expect(onResolved).toHaveBeenCalled())
    expect(mocks.announce).toHaveBeenCalledWith(expect.stringContaining('لغو شد'))
  })
})
