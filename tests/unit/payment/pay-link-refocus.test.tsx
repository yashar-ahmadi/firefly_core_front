import { act, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import cancelled from '../../fixtures/payment-attempt-cancel.json'
import { stubBrowserApis } from '../support/dom-stubs'
import { LINK_TOKEN, PAYMENT_UUID } from './fixtures'
import { payLink, verifyingAttempt } from './link-fixtures'
import { LINK_READ, ok, renderLink, routesReady, serve } from './pay-link-support'

// A verification that ends by itself (the status read: the attempt failed) hands the order back
// to the link page, which reads it again and shows its routes. The focus moves to the routes'
// heading only when it was in the panel that went away (or nowhere); a shopper reading or
// pressing something else keeps their place.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/features/payment/go-to-bank', () => ({ goToBank: vi.fn() }))
vi.mock('next/navigation', () => ({
  usePathname: () => `/order/pay/${LINK_TOKEN}/`,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

stubBrowserApis()

beforeEach(() => {
  mocks.bffFetch.mockReset()
  localStorage.clear()
})

/** The attempt's status read, answered when the test says so. */
function verifying() {
  let answer: (value: unknown) => void = () => {}
  const read = new Promise((resolve) => (answer = resolve))
  serve(mocks.bffFetch, {
    [`payment/${PAYMENT_UUID}/status/`]: () => read,
    [LINK_READ]: async () => ok(payLink()),
  })
  renderLink({ link: payLink({ open_attempt: verifyingAttempt() }) })
  const failed = { ...cancelled.data, method: 'bank_gateway', status: 'failed' }
  return {
    end: () => act(async () => answer(ok({ ...failed, failure_reason: 'gateway_rejected' }))),
  }
}

const routesHeading = () => screen.getByRole('heading', { level: 2, name: 'روش پرداخت' })

describe('a verification that ends by itself', () => {
  it('keeps the focus where the shopper put it, outside the panel', async () => {
    const { end } = verifying()
    await screen.findByRole('region', { name: 'پرداخت باز این سفارش' })
    const elsewhere = screen.getByRole('button', { name: 'لغو سفارش' })
    elsewhere.focus()
    await end()
    await routesReady()
    expect(routesHeading()).not.toHaveFocus()
    expect(elsewhere).toHaveFocus()
  })

  it('moves a focus that was nowhere to the routes’ heading', async () => {
    const { end } = verifying()
    await screen.findByRole('region', { name: 'پرداخت باز این سفارش' })
    expect(document.activeElement).toBe(document.body)
    await end()
    await routesReady()
    expect(routesHeading()).toHaveFocus()
  })
})
