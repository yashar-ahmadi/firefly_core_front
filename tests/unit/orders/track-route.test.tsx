import { render, screen } from '@testing-library/react'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import TrackRoute, { dynamic, generateMetadata } from '@/app/(shop)/order/track/page'
import { clientProviders } from '../support/providers'
import { resolveServerTree } from '../support/server-tree'

// `/order/track/` on the server (Plan 4 Global Constraints): in the shop's frame, rendered per
// request, never indexed, a real title, no loading.tsx (R9). The server's HTML holds the form and
// no order at all: a lookup is a POST made in the browser, its answer drawn there.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(() => new Promise(() => {})) }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/order/track/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/features/settings/api', () => ({
  getSiteSettings: async () => ({ name: 'فایرفلای', phone: '+982191000000' }),
  getTranslations: async () => ({}),
}))
vi.mock('@/features/seo/shop-name', () => ({ shopName: async () => 'فایرفلای' }))
vi.mock('@/config/store-config', () => ({
  getStoreConfig: () => ({ name: 'فایرفلای', siteUrl: 'http://localhost:3000' }),
}))

describe('/order/track/', () => {
  it('is titled «پیگیری سفارش», never indexed, and rendered per request', async () => {
    expect(dynamic).toBe('force-dynamic')
    const meta = await generateMetadata()
    expect(meta.title).toBe('پیگیری سفارش')
    expect(meta.robots).toEqual({ index: false, follow: true })
  })

  it('renders the heading and the form, and reads nothing', async () => {
    const { wrapper } = clientProviders()
    render(await resolveServerTree(await TrackRoute()), { wrapper })
    expect(screen.getByRole('heading', { level: 1, name: 'پیگیری سفارش' })).toBeInTheDocument()
    expect(await screen.findByRole('textbox', { name: /کد سفارش/ })).toBeInTheDocument()
    expect(mocks.bffFetch).not.toHaveBeenCalled()
  })

  it('has no loading.tsx', () => {
    const dir = 'src/app/(shop)/order/track/'
    for (const name of ['loading.tsx', 'loading.ts', 'loading.jsx', 'loading.js']) {
      expect(existsSync(join(process.cwd(), dir, name)), `${dir}${name}`).toBe(false)
    }
  })
})
