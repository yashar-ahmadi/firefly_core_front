import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ShopLayout from '@/app/(shop)/layout'

const mocks = vi.hoisted(() => ({ compare: true, quickView: true, compareFails: false }))

vi.mock('server-only', () => ({}))
vi.mock('@/components/layout/shop-shell', () => ({
  ShopShell: ({ children, overlays }: { children: ReactNode; overlays?: ReactNode }) => (
    <>
      <main>{children}</main>
      {overlays}
    </>
  ),
}))
vi.mock('@/features/compare/compare-bar', () => ({
  CompareBar: () => {
    if (mocks.compareFails) throw new Error('compare bar render bug')
    return <div>compare-bar</div>
  },
}))
vi.mock('@/features/quick-view/quick-view-host', () => ({
  QuickViewHost: () => <div>quick-view-host</div>,
}))
vi.mock('@/config/store-config', () => ({
  getStoreConfig: () => ({ features: { compare: mocks.compare, quickView: mocks.quickView } }),
}))

beforeEach(() => {
  mocks.compare = true
  mocks.quickView = true
  mocks.compareFails = false
})

describe('the shop layout', () => {
  it('mounts the compare bar and the quick view host once, around every shop page', () => {
    render(<ShopLayout>page</ShopLayout>)
    expect(screen.getByText('compare-bar')).toBeInTheDocument()
    expect(screen.getByText('quick-view-host')).toBeInTheDocument()
  })

  it('keeps the page and the other widgets when one widget fails to render', () => {
    mocks.compareFails = true
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      render(<ShopLayout>page</ShopLayout>)
      expect(screen.getByRole('main')).toHaveTextContent('page')
      expect(screen.getByText('quick-view-host')).toBeInTheDocument()
      expect(screen.queryByText('compare-bar')).toBeNull()
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining('compare-bar'),
        expect.any(Error),
      )
    } finally {
      consoleError.mockRestore()
    }
  })

  it('leaves out what the shop has switched off', () => {
    mocks.compare = false
    mocks.quickView = false
    render(<ShopLayout>page</ShopLayout>)
    expect(screen.queryByText('compare-bar')).toBeNull()
    expect(screen.queryByText('quick-view-host')).toBeNull()
  })
})
