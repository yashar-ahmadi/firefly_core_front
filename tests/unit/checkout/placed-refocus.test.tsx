import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/errors'
import cancelled from '../../fixtures/payment-attempt-cancel.json'
import attemptOpen from '../../fixtures/payment-intent-attempt-open.json'
import { stubBrowserApis } from '../support/dom-stubs'
import { LINK_TOKEN, PAYMENT_UUID } from '../payment/fixtures'
import { verifyingAttempt } from '../payment/link-fixtures'
import { ok, onlineCart, PLACE, placeButton, placed, renderCheckout, serve } from './place-support'

// The placed order's attempt is being verified (409 `payment_attempt_open`, row 3) and the
// verification ends by itself (its status read: failed): the routes come back. The focus moves
// to their heading only when it was in the panel that went away (or nowhere); a shopper on
// the «pay later» link keeps their place.

const LINK_INTENT = `payment/link/${LINK_TOKEN}/intent/`
const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), push: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/checkout/',
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/features/payment/go-to-bank', () => ({ goToBank: vi.fn() }))

stubBrowserApis()

beforeEach(() => {
  mocks.bffFetch.mockReset()
  sessionStorage.clear()
  localStorage.clear()
})

async function verifyingAfterPlacement() {
  const user = userEvent.setup()
  let answer: (value: unknown) => void = () => {}
  const read = new Promise((resolve) => (answer = resolve))
  const open = ApiError.fromBody(409, {
    ...attemptOpen,
    data: { ...attemptOpen.data, open_attempt: verifyingAttempt() },
  })
  serve(mocks.bffFetch, () => onlineCart(), {
    [PLACE]: placed(),
    [LINK_INTENT]: () => Promise.reject(open),
    [`payment/${PAYMENT_UUID}/status/`]: () => read,
  })
  renderCheckout({ cart: onlineCart() })
  const button = await placeButton()
  await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'))
  await user.click(button)
  await screen.findByRole('region', { name: 'پرداخت باز این سفارش' })
  const failed = { ...cancelled.data, method: 'bank_gateway', status: 'failed' }
  return {
    end: () => act(async () => answer(ok({ ...failed, failure_reason: 'gateway_rejected' }))),
  }
}

const routesHeading = () => screen.findByRole('heading', { level: 3, name: 'پرداخت سفارش' })

describe('the placed order’s verification ends by itself', () => {
  it('keeps the focus where the shopper put it, outside the panel', async () => {
    const { end } = await verifyingAfterPlacement()
    const later = screen.getByRole('link', { name: 'بعداً پرداخت می\u{200C}کنم' })
    later.focus()
    await end()
    expect(await routesHeading()).not.toHaveFocus()
    expect(later).toHaveFocus()
  })

  it('moves a focus that was nowhere to the routes’ heading', async () => {
    const { end } = await verifyingAfterPlacement()
    ;(document.activeElement as HTMLElement | null)?.blur()
    await end()
    const heading = await routesHeading()
    await waitFor(() => expect(heading).toHaveFocus())
  })
})
