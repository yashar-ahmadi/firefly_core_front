import { render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { PayLater } from '@/features/checkout/placed/pay-later'
import { clientProviders } from '../support/providers'

// Our own ways to a page whose URL holds a credential (the payment link's token, a payment's
// uuid) are full page loads, never the client router: a page loaded that way renders without
// the operator's scripts and with no referrer, while a client navigation would hand the new URL
// to scripts already running on the page before (an analytics history listener, say).

vi.mock('next/navigation', () => ({
  usePathname: () => '/checkout/thanks/0123456789/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))
// Marks what goes through the client router.
vi.mock('next/link', () => ({
  default: (props: ComponentProps<'a'> & { prefetch?: boolean }) => {
    const { prefetch, ...anchor } = props
    void prefetch
    return <a data-client-router="" {...anchor} />
  },
}))

describe('links to the payment link’s page', () => {
  it('load it as a new page; tracking stays a client navigation', () => {
    const { wrapper } = clientProviders()
    render(
      <PayLater guest orderCode="0123456789" linkToken="tok_en-1" expiresAt={null} payable />,
      { wrapper },
    )
    const pay = screen.getByRole('link', { name: 'لینک پرداخت سفارش' })
    expect(pay).toHaveAttribute('href', '/order/pay/tok_en-1/')
    expect(pay).not.toHaveAttribute('data-client-router')
    expect(screen.getByRole('link', { name: /پیگیری سفارش/ })).toHaveAttribute('data-client-router')
  })
})
