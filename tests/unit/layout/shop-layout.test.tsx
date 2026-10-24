import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ShopLayout from '@/app/(shop)/layout'

const mocks = vi.hoisted(() => ({ compare: true, quickView: true, pwa: true, compareFails: false }))

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
vi.mock('@/features/pwa/install-prompt-slot', () => ({
  InstallPromptSlot: () => <div>install-prompt</div>,
}))
vi.mock('@/lib/session/kept-copy-session', () => ({
  KeptCopySession: () => <div>kept-copy-session</div>,
}))
vi.mock('@/config/store-config', () => ({
  getStoreConfig: () => ({
    features: { compare: mocks.compare, quickView: mocks.quickView, pwa: mocks.pwa },
  }),
}))

beforeEach(() => {
  mocks.compare = true
  mocks.quickView = true
  mocks.pwa = true
  mocks.compareFails = false
})

describe('the shop layout', () => {
  it('mounts the compare bar, the quick view host and the install prompt’s slot once', () => {
    render(<ShopLayout>page</ShopLayout>)
    expect(screen.getByText('compare-bar')).toBeInTheDocument()
    expect(screen.getByText('quick-view-host')).toBeInTheDocument()
    expect(screen.getByText('install-prompt')).toBeInTheDocument()
    // With the PWA on, a page may be the worker's kept copy: its session state is set right.
    expect(screen.getByText('kept-copy-session')).toBeInTheDocument()
  })

  it('keeps the page and the other widgets when one widget fails to render', () => {
    mocks.compareFails = true
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      render(<ShopLayout>page</ShopLayout>)
      expect(screen.getByRole('main')).toHaveTextContent('page')
      expect(screen.getByText('quick-view-host')).toBeInTheDocument()
      expect(screen.queryByText('compare-bar')).toBeNull()
      // Reported once (by React), not again by the boundary.
      const reports = consoleError.mock.calls.filter((args) =>
        args.some((arg) => arg instanceof Error && arg.message === 'compare bar render bug'),
      )
      expect(reports).toHaveLength(1)
    } finally {
      consoleError.mockRestore()
    }
  })

  it('leaves out what the shop has switched off', () => {
    mocks.compare = false
    mocks.quickView = false
    mocks.pwa = false
    render(<ShopLayout>page</ShopLayout>)
    expect(screen.queryByText('compare-bar')).toBeNull()
    expect(screen.queryByText('quick-view-host')).toBeNull()
    expect(screen.queryByText('install-prompt')).toBeNull()
    expect(screen.queryByText('kept-copy-session')).toBeNull()
  })
})
