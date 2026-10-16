import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ShopLayout from '@/app/(shop)/layout'

const mocks = vi.hoisted(() => ({ compare: true, quickView: true }))

vi.mock('server-only', () => ({}))
vi.mock('@/components/layout/shop-shell', () => ({
  ShopShell: ({ children, overlays }: { children: ReactNode; overlays?: ReactNode }) => (
    <>
      <main>{children}</main>
      {overlays}
    </>
  ),
}))
vi.mock('@/features/compare/compare-bar', () => ({ CompareBar: () => <div>compare-bar</div> }))
vi.mock('@/features/quick-view/quick-view-host', () => ({
  QuickViewHost: () => <div>quick-view-host</div>,
}))
vi.mock('@/config/store-config', () => ({
  getStoreConfig: () => ({ features: { compare: mocks.compare, quickView: mocks.quickView } }),
}))

beforeEach(() => {
  mocks.compare = true
  mocks.quickView = true
})

describe('the shop layout', () => {
  it('mounts the compare bar and the quick view host once, around every shop page', () => {
    render(<ShopLayout>page</ShopLayout>)
    expect(screen.getByText('compare-bar')).toBeInTheDocument()
    expect(screen.getByText('quick-view-host')).toBeInTheDocument()
  })

  it('leaves out what the shop has switched off', () => {
    mocks.compare = false
    mocks.quickView = false
    render(<ShopLayout>page</ShopLayout>)
    expect(screen.queryByText('compare-bar')).toBeNull()
    expect(screen.queryByText('quick-view-host')).toBeNull()
  })
})
