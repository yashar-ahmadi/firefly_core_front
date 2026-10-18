import { render, screen } from '@testing-library/react'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import ThanksRoute, {
  dynamic,
  generateMetadata,
} from '@/app/(checkout)/checkout/thanks/[code]/page'
import { clientProviders } from '../support/providers'
import { resolveServerTree } from '../support/server-tree'

// `/checkout/thanks/<code>/`: per visitor (dynamic), never indexed, a real title; a code that is
// not an order code (10 digits) is a 404 with the not-found title (R9), never a soft page.

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))
vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
  usePathname: () => '/checkout/thanks/5592580094/',
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

const params = (code: string) => ({ params: Promise.resolve({ code }) })

describe('/checkout/thanks/<code>/', () => {
  it('is titled, never indexed, and rendered per request', async () => {
    const meta = await generateMetadata(params('5592580094'))
    expect(meta.title).toBe('ثبت سفارش')
    expect(meta.robots).toEqual({ index: false, follow: true })
    expect(dynamic).toBe('force-dynamic')
  })

  it('renders the page for an order code (the browser reads the rest)', async () => {
    const { wrapper } = clientProviders()
    render(await resolveServerTree(ThanksRoute(params('0404614013'))), { wrapper })
    // No record in this test's browser: the calm page for the code (it may start with 0).
    expect(await screen.findByRole('heading', { name: 'سفارش ۰۴۰۴۶۱۴۰۱۳' })).toBeInTheDocument()
  })

  it('anything but 10 digits is a 404, with the not-found title', async () => {
    await expect(ThanksRoute(params('12345'))).rejects.toThrow('NEXT_NOT_FOUND')
    await expect(ThanksRoute(params('559258009x'))).rejects.toThrow('NEXT_NOT_FOUND')
    expect((await generateMetadata(params('12345'))).title).toEqual({
      absolute: expect.stringContaining('فایرفلای'),
    })
  })

  it('has no loading.tsx (it would turn the 404 into a soft 200)', () => {
    const dir = 'src/app/(checkout)/checkout/thanks/[code]/'
    for (const name of ['loading.tsx', 'loading.ts', 'loading.jsx', 'loading.js']) {
      expect(existsSync(join(process.cwd(), dir, name)), `${dir}${name}`).toBe(false)
    }
  })
})
