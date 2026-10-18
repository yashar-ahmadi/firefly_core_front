import { render, screen } from '@testing-library/react'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import PaymentCallbackRoute, {
  dynamic,
  generateMetadata,
} from '@/app/(checkout)/payment/callback/page'
import { clientProviders } from '../support/providers'
import { resolveServerTree } from '../support/server-tree'

// `/payment/callback/` on the server (order digest §4.2; Plan 4 Global Constraints): in the
// checkout's quiet frame, rendered per request, never indexed, no canonical (its URL holds the
// payment's uuid), a real title, no loading.tsx (R9). The server never reads the query: the
// page's first words are the same for every return («در حال بررسی…»), the uuid is read in the
// browser.

vi.mock('server-only', () => ({}))
vi.mock('@/lib/api/client', () => ({ bffFetch: () => new Promise(() => {}) }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/payment/callback/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/features/settings/api', () => ({
  getSiteSettings: async () => ({ name: 'فایرفلای', phone: '+982191000000' }),
}))
vi.mock('@/features/seo/shop-name', () => ({ shopName: async () => 'فایرفلای' }))

const DIR = 'src/app/(checkout)/payment/callback/'

describe('/payment/callback/', () => {
  it('is dynamic, never indexed, without a canonical, titled «نتیجهٔ پرداخت»', async () => {
    expect(dynamic).toBe('force-dynamic')
    const metadata = await generateMetadata()
    expect(metadata.title).toBe('نتیجهٔ پرداخت')
    expect(metadata.robots).toMatchObject({ index: false })
    expect(metadata.alternates?.canonical ?? null).toBeNull()
  })

  it('renders the page’s first words, whatever the query (the server never reads it)', async () => {
    window.history.replaceState(null, '', '/payment/callback/')
    const { wrapper } = clientProviders()
    render(await resolveServerTree(PaymentCallbackRoute()), { wrapper })
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument()
    const source = readFileSync(join(process.cwd(), DIR, 'page.tsx'), 'utf8')
    expect(source).not.toMatch(/searchParams/)
  })

  it('sits in the checkout frame and has no loading.tsx', () => {
    expect(existsSync(join(process.cwd(), DIR, 'page.tsx'))).toBe(true)
    for (const dir of [DIR, 'src/app/(checkout)/payment/']) {
      for (const name of ['loading.tsx', 'loading.ts', 'loading.jsx', 'loading.js']) {
        expect(existsSync(join(process.cwd(), dir, name)), `${dir}${name}`).toBe(false)
      }
    }
  })
})
