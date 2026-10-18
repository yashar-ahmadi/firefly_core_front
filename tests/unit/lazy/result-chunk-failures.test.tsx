import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clientProviders } from '../support/providers'
import { stubBrowserApis } from '../support/dom-stubs'
import { PAYMENT_UUID } from '../payment/fixtures'
import { arrive, renderResult, serve, status } from '../payment/result-support'

// The result page's lazily loaded parts when their code cannot be downloaded (a deploy since the
// page loaded, the connection): the island says so with a reload (the page reads the payment
// again from this tab's copy); the confetti is simply not thrown. Never the root error page.

const CHUNK_FAILED = vi.hoisted(() => () => {
  throw new Error('ChunkLoadError: Loading chunk failed.')
})
const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/features/payment/confetti', CHUNK_FAILED)
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/payment/callback/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

stubBrowserApis()

let consoleError: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  consoleError = vi.spyOn(console, 'error')
  mocks.bffFetch.mockReset()
})
afterEach(() => {
  expect(consoleError).not.toHaveBeenCalled()
  consoleError.mockRestore()
})

describe('the result page’s lazy parts, when their code cannot load', () => {
  it('the confetti: not thrown, the success said all the same', async () => {
    serve(mocks.bffFetch, [status({ status: 'settled' })])
    arrive(`?result=success&payment=${PAYMENT_UUID}`)
    await renderResult()
    await act(async () => {})
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('پرداخت موفق')
  })
})

describe('the island', () => {
  it('says so, with a reload', async () => {
    vi.resetModules()
    vi.doMock('@/features/payment/result-page', CHUNK_FAILED)
    const { PaymentResult } = await import('@/features/payment/result-loader')
    const { wrapper } = clientProviders()
    render(<PaymentResult support={null} />, { wrapper })
    expect(await screen.findByRole('alert')).toHaveTextContent('این صفحه بارگذاری نشد')
    expect(screen.getByRole('button', { name: 'بارگذاری دوباره' })).toBeInTheDocument()
    vi.doUnmock('@/features/payment/result-page')
  })
})
