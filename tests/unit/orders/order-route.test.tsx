import { render, screen } from '@testing-library/react'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OrderNotFound from '@/app/(shop)/account/orders/[code]/not-found'
import OrderRoute, { dynamic, generateMetadata } from '@/app/(shop)/account/orders/[code]/page'
import { ApiError } from '@/lib/api/errors'
import { catalog } from '../payment/fixtures'
import { resolveServerTree } from '../support/server-tree'
import { detail, renderAccount } from './account-support'

// `/account/orders/<code>/` on the server (order digest §3.1.3; R9): the order read once per
// request (shared with the metadata) with the session's token and the visitor's IP, never
// cached; a code of the wrong shape never reaches the API; an order that is not this account's
// (or none: one 404 for both) is a real 404 inside the account shell; no token, or no answer: the
// browser reads it. Titled «سفارش <code>», rendered per request, no loading.tsx.

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  access: 'a.b.c' as string | undefined,
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/api/server', () => ({ apiFetch: mocks.apiFetch }))
vi.mock('@/lib/api/client', () => ({ bffFetch: () => new Promise(() => {}) }))
vi.mock('@/lib/bff/session', () => ({ isJwt: (value: unknown) => typeof value === 'string' }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-real-ip': '203.0.113.9' }),
  cookies: async () => ({
    get: (name: string) => (name === 'ff_at' && mocks.access ? { value: mocks.access } : undefined),
  }),
}))
vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
  usePathname: () => '/account/orders/7010868573/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/config/env', () => ({ getServerEnv: () => ({ CLIENT_IP_HEADER: 'x-real-ip' }) }))
vi.mock('@/features/payment/catalog', () => ({ getPaymentCatalog: async () => catalog() }))
vi.mock('@/features/settings/api', () => ({
  getSiteSettings: async () => ({ name: 'فایرفلای', phone: '+982191000000' }),
  getTranslations: async () => ({}),
}))
vi.mock('@/features/seo/shop-name', () => ({ shopName: async () => 'فایرفلای' }))

const CODE = '7010868573'
const params = (code = CODE) => ({ params: Promise.resolve({ code }) })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.access = 'a.b.c'
  mocks.apiFetch.mockResolvedValue({ data: detail('delivered'), msg: '', status: 200 })
})

async function show(code = CODE) {
  renderAccount(await resolveServerTree(OrderRoute(params(code))))
}

describe('/account/orders/<code>/', () => {
  it('reads the order with the session and the visitor’s IP, uncached; titled with its code', async () => {
    expect((await generateMetadata(params())).title).toBe('سفارش ۷۰۱۰۸۶۸۵۷۳')
    await show()
    expect(screen.getByRole('heading', { level: 1, name: 'سفارش ۷۰۱۰۸۶۸۵۷۳' })).toBeVisible()
    // One read for the metadata and the page of a request (React `cache`) at most per call here.
    const [path, options] = mocks.apiFetch.mock.calls[0]!
    expect(path).toBe(`order/${CODE}/`)
    expect(options).toMatchObject({ token: 'a.b.c', forwardedFor: '203.0.113.9' })
    expect(options).not.toHaveProperty('revalidate')
    expect(dynamic).toBe('force-dynamic')
  })

  it('not this account’s order (404): a real 404, its own title', async () => {
    mocks.apiFetch.mockRejectedValue(new ApiError({ status: 404, code: 'not_found' }))
    await expect(OrderRoute(params())).rejects.toThrow('NEXT_NOT_FOUND')
    expect((await generateMetadata(params())).title).toMatchObject({
      absolute: expect.stringContaining('فایرفلای'),
    })
  })

  it('a code of the wrong shape: a 404, the API never asked', async () => {
    for (const code of ['123', '70108685734', 'abcdefghij', '۷۰۱۰۸۶۸۵۷۳']) {
      await expect(OrderRoute(params(code))).rejects.toThrow('NEXT_NOT_FOUND')
    }
    expect(mocks.apiFetch).not.toHaveBeenCalled()
  })

  it('no token yet, or no answer: the page renders and reads it in the browser', async () => {
    mocks.access = undefined
    await show()
    expect(mocks.apiFetch).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('در حال خواندن سفارش')
  })

  it('the 404 page is inside the account shell, with the way to the orders', () => {
    render(<OrderNotFound />)
    expect(screen.getByRole('heading', { level: 1, name: 'سفارش پیدا نشد' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'سفارش‌های من' })).toHaveAttribute(
      'href',
      '/account/orders/',
    )
  })

  it('has no loading.tsx (R9: a missing order must stay a 404)', () => {
    const dir = join(process.cwd(), 'src/app/(shop)/account/orders')
    expect(existsSync(join(dir, 'loading.tsx'))).toBe(false)
    expect(existsSync(join(dir, '[code]', 'loading.tsx'))).toBe(false)
  })
})
