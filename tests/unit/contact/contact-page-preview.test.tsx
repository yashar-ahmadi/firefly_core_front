import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ContactRoute, { generateMetadata } from '@/app/(shop)/contact-us/page'
import { clearMissing } from '@/features/catalog/loaders/missing'
import { ApiError } from '@/lib/api/errors'
import type { PageDetail } from '@/lib/api/types/page'
import { paginated, renderTree } from '../blog/page-support'
import { pageFixture } from '../content/page-fixtures'
import { stubBrowserApis } from '../support/dom-stubs'
import { SUBJECTS } from './contact-support'

// A staff preview of a draft `contact-us` page at `/contact-us/` (`/page/contact-us/` redirects
// there, so it is the only place a draft of it can be seen): Task 3's two-path read. The
// published page is read anonymously and cached; only when that is a 404 and the visitor has a
// session (a JWT-shaped `ff_at`) is it read again with their token and IP, uncached. A draft
// comes back for staff only, under the preview bar, and the page is noindex.

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn(), cookies: new Map<string, string>() }))

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-real-ip': '5.6.7.8' }),
  cookies: async () => ({
    get: (name: string) =>
      mocks.cookies.has(name) ? { name, value: mocks.cookies.get(name) } : undefined,
  }),
}))
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/lib/api/server', () => ({ apiFetch: mocks.apiFetch }))
vi.mock('@/lib/api/client', () => ({ bffFetch: vi.fn() }))
vi.mock('@/features/settings/api', () => ({
  getTranslations: async () => ({}),
  getSiteSettings: async () => ({ name: 'فایرفلای', phone: '+982191000000' }),
}))
vi.mock('@/config/store-config', async () => {
  const pure = await import('@/config/resolve-store-config')
  const { parseServerEnv } = await import('@/config/env-schema')
  const env = { FIREFLY_API_URL: 'https://api.shop.ir', SITE_URL: 'https://shop.ir' }
  return { ...pure, getStoreConfig: () => pure.resolveStoreConfig(parseServerEnv(env)) }
})

stubBrowserApis()

const STAFF_TOKEN = 'aaa.bbb.ccc'
const ok = (data: unknown) =>
  Promise.resolve({ data, msg: '', status: 200, headers: new Headers() })
const notFound = () => new ApiError({ status: 404, code: 'not_found', detail: 'یافت نشد.' })

const DRAFT = pageFixture({
  id: 2,
  slug: 'contact-us',
  title: 'تماس با ما (پیش\u{200C}نویس)',
  content: '<p>ساعات پاسخگویی تازه</p>',
  enable_comments: false,
  comment_count: 0,
  is_unpublished: true,
})

/**
 * The API: `pages/contact-us` answers 404 anonymously (a draft) and `preview` with the staff
 * token (a draft for staff; null: the same 404, anyone else; an Error: a failed read).
 */
function answer({
  published = null as PageDetail | null,
  preview = DRAFT as PageDetail | null | Error,
} = {}) {
  mocks.apiFetch.mockImplementation((path: string, options: { token?: string } = {}) => {
    if (path === 'contact-us/subject/list') return ok(paginated(SUBJECTS))
    if (path !== 'pages/contact-us') return Promise.reject(new Error(`unexpected read: ${path}`))
    if (options.token === undefined) return published ? ok(published) : Promise.reject(notFound())
    if (preview instanceof Error) return Promise.reject(preview)
    return preview ? ok(preview) : Promise.reject(notFound())
  })
}

const pageReads = () =>
  mocks.apiFetch.mock.calls.filter(([path]) => path === 'pages/contact-us').map(([, o]) => o)

beforeEach(() => {
  mocks.apiFetch.mockReset()
  mocks.cookies.clear()
  clearMissing()
  document.head.innerHTML = ''
})

describe('a draft contact-us page at /contact-us/', () => {
  it('staff: read again with the token and IP, uncached; shown under the preview bar', async () => {
    mocks.cookies.set('ff_at', STAFF_TOKEN)
    answer()
    await renderTree(await ContactRoute())
    expect(pageReads()).toEqual([
      { revalidate: 300, tags: ['page:contact-us', 'pages'] },
      { token: STAFF_TOKEN, forwardedFor: '5.6.7.8' },
    ])
    const bar = screen.getByText('پیش\u{200C}نویس — منتشر نشده')
    expect(bar).toHaveAttribute('role', 'status')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'تماس با ما (پیش\u{200C}نویس)',
    )
    expect(screen.getByText('ساعات پاسخگویی تازه')).toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'فرم تماس' })).toBeInTheDocument()
  })

  it('staff: the head is noindex, nofollow', async () => {
    mocks.cookies.set('ff_at', STAFF_TOKEN)
    answer()
    expect((await generateMetadata()).robots).toEqual({ index: false, follow: false })
  })

  it('a guest (no session): no second read, no draft, no bar', async () => {
    answer()
    await renderTree(await ContactRoute())
    expect(pageReads()).toHaveLength(1)
    expect(screen.queryByText('ساعات پاسخگویی تازه')).toBeNull()
    expect(screen.queryByText('پیش\u{200C}نویس — منتشر نشده')).toBeNull()
    expect((await generateMetadata()).robots).toBeUndefined()
  })

  it('a session that is not staff: the same 404, so the page without it', async () => {
    mocks.cookies.set('ff_at', STAFF_TOKEN)
    answer({ preview: null })
    await renderTree(await ContactRoute())
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('تماس با ما')
    expect(screen.queryByText('پیش\u{200C}نویس — منتشر نشده')).toBeNull()
  })

  it('a published page is read once, anonymously, even with a session', async () => {
    mocks.cookies.set('ff_at', STAFF_TOKEN)
    answer({ published: { ...DRAFT, is_unpublished: false, title: 'تماس' } })
    await renderTree(await ContactRoute())
    expect(pageReads()).toEqual([{ revalidate: 300, tags: ['page:contact-us', 'pages'] }])
    expect(screen.queryByText('پیش\u{200C}نویس — منتشر نشده')).toBeNull()
  })

  it('a failed preview read leaves the form (logged)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.cookies.set('ff_at', STAFF_TOKEN)
    answer({ preview: new ApiError({ status: 502, code: 'http_502' }) })
    await renderTree(await ContactRoute())
    expect(screen.getByRole('form', { name: 'فرم تماس' })).toBeInTheDocument()
    expect(log).toHaveBeenCalled()
  })
})
