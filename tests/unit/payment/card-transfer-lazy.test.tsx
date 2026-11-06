import { act } from '@testing-library/react'
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

// What the card-transfer page reads only when it needs it (Task 7's carry): the order's ownership
// read (`GET order/<code>/`) is never made for a page whose cards read was refused (the calm page
// offers nothing that depends on it).

const mocks = vi.hoisted(() => ({
  bffFetch: vi.fn(),
  loadPage: vi.fn(),
  probe: vi.fn(),
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/lib/navigation/hard-navigation', () => ({
  loadPage: mocks.loadPage,
  reloadPage: vi.fn(),
}))
vi.mock('@/features/payment/card-transfer/receipt-image', () => ({ probeImage: mocks.probe }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/payment/card-transfer/x/',
}))

stubTransferApis()

const ORDER = 'order/1411635340/'

beforeEach(() => {
  localStorage.clear()
  mocks.bffFetch.mockReset()
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
