import { render, screen } from '@testing-library/react'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import CartRoute, { dynamic, generateMetadata } from '@/app/(shop)/cart/page'
import { FeatureProvider } from '@/features/settings/feature-context'
import { clientProviders } from '../support/providers'
import { resolveServerTree } from '../support/server-tree'

// `/cart/`: a per-visitor page (Plan 4 global constraints: noindex and dynamic), titled, with
// the cart read in the browser (a skeleton first), and no loading.tsx (ruling R9).

vi.mock('server-only', () => ({}))
vi.mock('@/lib/api/client', () => ({ bffFetch: () => new Promise(() => {}) }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/cart/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/features/settings/api', () => ({
  getTranslations: async () => ({}),
  getSiteSettings: async () => ({ name: 'فایرفلای' }),
}))

describe('/cart/', () => {
  it('is titled «سبد خرید», never indexed, and rendered per request', async () => {
    const meta = await generateMetadata()
    expect(meta.title).toBe('سبد خرید')
    expect(meta.robots).toEqual({ index: false, follow: true })
    expect(dynamic).toBe('force-dynamic')
  })

  it('renders the heading, and the cart’s skeleton until the cart is read', async () => {
    const { wrapper: Wrapper } = clientProviders()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <FeatureProvider initial={{}}>
        <Wrapper>{children}</Wrapper>
      </FeatureProvider>
    )
    render(await resolveServerTree(CartRoute()), { wrapper })
    expect(screen.getByRole('heading', { level: 1, name: 'سبد خرید' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'در حال بارگذاری سبد خرید' })).toBeInTheDocument()
  })

  it('has no loading.tsx (it would turn errors into soft 200s)', () => {
    const segment = join(process.cwd(), 'src/app/(shop)/cart/')
    for (const name of ['loading.tsx', 'loading.ts', 'loading.jsx', 'loading.js']) {
      expect(existsSync(`${segment}${name}`), name).toBe(false)
    }
  })
})
