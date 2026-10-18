import { act, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/errors'
import {
  CARDS,
  calls,
  ok,
  renderTransfer,
  serve,
  STATUS,
  status,
  stubTransferApis,
} from './card-transfer-support'

// What the card-transfer page loads and reads only when it needs it (Task 7's carry): the
// «کپی لینک این صفحه» button is its own chunk, fetched only for a payment refused as another
// account's (the calm page's `forbidden`), never on an ordinary visit; and the order's ownership
// read (`GET order/<code>/`) is never made for a page whose cards read was refused (the calm page
// offers nothing that depends on it).

const mocks = vi.hoisted(() => ({
  bffFetch: vi.fn(),
  loadPage: vi.fn(),
  probe: vi.fn(),
  /** Whether the button's module was imported (a flag: call records are cleared per test). */
  copy: { loaded: false },
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/lib/navigation/hard-navigation', () => ({
  loadPage: mocks.loadPage,
  reloadPage: vi.fn(),
}))
vi.mock('@/features/payment/card-transfer/receipt-image', () => ({ probeImage: mocks.probe }))
vi.mock('@/features/payment/card-transfer/copy-page-link', async (importOriginal) => {
  mocks.copy.loaded = true
  return importOriginal()
})
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/payment/card-transfer/x/',
}))

stubTransferApis()

const ORDER = 'order/1411635340/'
const forbidden = () => Promise.reject(new ApiError({ status: 403, code: 'payment_forbidden' }))

beforeEach(() => {
  localStorage.clear()
  mocks.bffFetch.mockReset()
})

describe('«کپی لینک این صفحه»', () => {
  // In this order: the module, once imported, stays imported for the file.
  it('an ordinary visit (the form) never fetches its code', async () => {
    serve(mocks.bffFetch)
    await renderTransfer()
    expect(screen.getByRole('heading', { level: 1, name: 'پرداخت کارت به کارت' })).toBeVisible()
    expect(mocks.copy.loaded).toBe(false)
  })

  it('another account’s payment: loaded then, and offered on the calm page', async () => {
    serve(mocks.bffFetch, { [STATUS]: forbidden, [CARDS]: forbidden })
    await renderTransfer({ hasSession: true })
    expect(await screen.findByRole('button', { name: 'کپی لینک این صفحه' })).toBeVisible()
    expect(mocks.copy.loaded).toBe(true)
  })
})

describe('the ownership read', () => {
  it.each([
    ['a wait (429)', () => Promise.reject(new ApiError({ status: 429, code: 'throttled' }))],
    ['no answer', () => Promise.reject(new ApiError({ status: 0, code: 'network_error' }))],
  ])('signed in, the cards refused (%s): no order read', async (_, refused) => {
    serve(mocks.bffFetch, {
      [STATUS]: () => ok(status()),
      [CARDS]: refused,
      [ORDER]: () => ok({ uuid: 'x', payment_url: null }),
    })
    await renderTransfer({ hasSession: true })
    await act(async () => {})
    expect(calls(mocks.bffFetch, ORDER)).toHaveLength(0)
  })

  it('signed in, the form: read once', async () => {
    serve(mocks.bffFetch, { [ORDER]: () => ok({ uuid: 'x', payment_url: null }) })
    await renderTransfer({ hasSession: true })
    await act(async () => {})
    expect(calls(mocks.bffFetch, ORDER)).toHaveLength(1)
  })
})
