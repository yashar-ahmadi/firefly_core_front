import { render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PaymentSection, ReviewSection } from '@/features/checkout/lazy-steps'
import { contextOf } from '@/features/checkout/placed-order'
import { PlacedOrderPanel } from '@/features/checkout/placed/placed-loader'
import { clientProviders } from '../support/providers'
import { placement } from '../payment/fixtures'

// The checkout's lazily loaded parts (the payment and review steps, the placed order's payment)
// when their code cannot be downloaded (a deploy since the page loaded, the connection): each
// degrades in place, never to the root error page. The steps say so with a reload; a placed
// order still shows its code and the way to its page.

vi.mock('@/features/checkout/later-steps', () => {
  throw new Error('ChunkLoadError: Loading chunk failed.')
})
vi.mock('@/features/checkout/placed/placed-order-panel', () => {
  throw new Error('ChunkLoadError: Loading chunk failed.')
})
vi.mock('@/lib/api/client', () => ({ bffFetch: () => new Promise(() => {}) }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/checkout/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error')
})

afterEach(() => {
  expect(consoleError).not.toHaveBeenCalled()
  consoleError.mockRestore()
})

const { wrapper } = clientProviders()

describe('the checkout’s lazy parts, when their code cannot load', () => {
  it('a later step says so, with a reload', async () => {
    render(<PaymentSection {...({} as ComponentProps<typeof PaymentSection>)} />, { wrapper })
    expect(await screen.findByText('این بخش بارگذاری نشد.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'بارگذاری دوباره' })).toBeInTheDocument()
    render(<ReviewSection {...({} as ComponentProps<typeof ReviewSection>)} />, { wrapper })
    await waitFor(() => expect(screen.getAllByText('این بخش بارگذاری نشد.')).toHaveLength(2))
  })

  it('a placed order still shows its code and the way to its page', async () => {
    const ctx = contextOf(placement(), { guest: true, route: 'bank_gateway', gatewayCode: null })
    render(<PlacedOrderPanel ctx={ctx} catalog={{} as never} supportPhone={null} />, { wrapper })
    expect(await screen.findByRole('heading', { name: 'سفارش شما ثبت شد' })).toBeInTheDocument()
    expect(screen.getByText('۵۵۹۲۵۸۰۰۹۴')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'مشاهده و پرداخت سفارش' })).toHaveAttribute(
      'href',
      '/checkout/thanks/5592580094/',
    )
  })
})
