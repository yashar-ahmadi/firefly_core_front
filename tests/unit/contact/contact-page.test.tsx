import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ContactRoute, { dynamic, generateMetadata } from '@/app/(shop)/contact-us/page'
import { clearMissing } from '@/features/catalog/loaders/missing'
import { ApiError } from '@/lib/api/errors'
import type { PageDetail } from '@/lib/api/types/page'
import { paginated, renderTree } from '../blog/page-support'
import { pageFixture } from '../content/page-fixtures'
import { stubBrowserApis } from '../support/dom-stubs'
import { SUBJECTS } from './contact-support'

// `/contact-us/`, the canonical contact page (the backend's `support_link`): rendered per
// request (content digest §9.2), the operator's `contact-us` page's content above the form when
// there is one (its meta rows, its title; the canonical always `/contact-us/`), the shop's
// contact details from the settings, and the form with the subjects (cached 300 s, tagged).

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
  getSiteSettings: async () => ({
    name: 'فایرفلای',
    phone: '+982191000000',
    phone2: null,
    email: 'support@firefly-core.ir',
    address: 'تهران، خیابان ولیعصر',
    postal_code: '1969734512',
    map: 'https://maps.google.com/?q=35.7564,51.4100',
    response_time: 'شنبه تا چهارشنبه ۹ تا ۱۸',
    support_link: 'https://firefly-core.ir/contact-us/',
  }),
}))
vi.mock('@/config/store-config', async () => {
  const pure = await import('@/config/resolve-store-config')
  const { parseServerEnv } = await import('@/config/env-schema')
  const env = { FIREFLY_API_URL: 'https://api.shop.ir', SITE_URL: 'https://shop.ir' }
  return { ...pure, getStoreConfig: () => pure.resolveStoreConfig(parseServerEnv(env)) }
})
vi.mock('@/config/env', async () => {
  const { parseServerEnv } = await import('@/config/env-schema')
  const env = parseServerEnv({
    FIREFLY_API_URL: 'https://api.shop.ir',
    SITE_URL: 'https://shop.ir',
  })
  return { getServerEnv: () => env }
})

stubBrowserApis()

const ok = (data: unknown) =>
  Promise.resolve({ data, msg: '', status: 200, headers: new Headers() })
const notFound = () => new ApiError({ status: 404, code: 'not_found', detail: 'یافت نشد.' })

const CONTACT_PAGE = pageFixture({
  id: 2,
  slug: 'contact-us',
  title: 'تماس با ما',
  page_title: 'تماس با ما',
  content: '<h2>ساعات پاسخگویی</h2><p onclick="x()">پشتیبانی شنبه تا چهارشنبه پاسخگوی شماست.</p>',
  enable_comments: false,
  comment_count: 0,
  question_count: 0,
  canonical_link: 'https://shop.ir/page/contact-us/',
  meta_tags: [
    { field: 'og:image', value: 'https://cdn.shop.ir/contact.png' },
    { field: 'author', value: 'فایرفلای' },
  ],
})

function answer({ page = CONTACT_PAGE as PageDetail | null | Error, subjects = SUBJECTS } = {}) {
  mocks.apiFetch.mockImplementation((path: string) => {
    if (path === 'contact-us/subject/list') return ok(paginated(subjects))
    if (path === 'pages/contact-us') {
      if (page instanceof Error) return Promise.reject(page)
      return page ? ok(page) : Promise.reject(notFound())
    }
    return Promise.reject(new Error(`unexpected read: ${path}`))
  })
}

async function show(api: Parameters<typeof answer>[0] = {}) {
  answer(api)
  return renderTree(await ContactRoute())
}

const form = () => screen.getByRole('form', { name: 'فرم تماس' })

beforeEach(() => {
  mocks.apiFetch.mockReset()
  mocks.cookies.clear()
  clearMissing()
  document.head.innerHTML = ''
})

describe('the contact page', () => {
  it('is rendered per request', () => {
    expect(dynamic).toBe('force-dynamic')
  })

  it('shows the contact-us page’s content (sanitised) above the form, under its title', async () => {
    await show()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('تماس با ما')
    const content = screen.getByText('پشتیبانی شنبه تا چهارشنبه پاسخگوی شماست.')
    expect(content).not.toHaveAttribute('onclick')
    expect(content.compareDocumentPosition(form()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(document.querySelector('meta[property="og:image"]')).toHaveAttribute(
      'content',
      'https://cdn.shop.ir/contact.png',
    )
  })

  it('without a contact-us page: its own title, the details and the form', async () => {
    await show({ page: null })
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('تماس با ما')
    expect(form()).toBeInTheDocument()
  })

  it('still shows the form when the page cannot be read (logged)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await show({ page: new ApiError({ status: 500, code: 'http_500' }) })
    expect(form()).toBeInTheDocument()
  })

  it('reads the subjects and the page anonymously and cached; never a staff read', async () => {
    mocks.cookies.set('ff_at', 'aaa.bbb.ccc')
    await show({ page: null })
    const reads = mocks.apiFetch.mock.calls.map(([path, options]) => [path, options])
    expect(reads).toContainEqual([
      'contact-us/subject/list',
      { query: { limit: 100, page: 1 }, revalidate: 300, tags: ['contact-subjects'] },
    ])
    for (const [, options] of reads) {
      expect(options).not.toHaveProperty('token')
      expect(options).not.toHaveProperty('forwardedFor')
    }
    expect(reads.filter(([path]) => path === 'pages/contact-us')).toHaveLength(1)
  })

  it('offers the subjects in the API’s order', async () => {
    await show()
    const select = within(form()).getByRole('combobox', { name: /موضوع پیام/ }) as HTMLSelectElement
    expect([...select.options].map((option) => option.text)).toEqual([
      'انتخاب کنید',
      'پیگیری سفارش',
      'پیشنهاد',
      'انتقاد و شکایت',
    ])
  })

  it('shows the shop’s details from the settings: phone, e-mail, address, map, hours', async () => {
    await show()
    const info = within(screen.getByRole('region', { name: 'راه\u{200C}های ارتباطی' }))
    expect(info.getByRole('link', { name: '۰۲۱ ۹۱۰۰ ۰۰۰۰' })).toHaveAttribute(
      'href',
      'tel:+982191000000',
    )
    expect(info.getByRole('link', { name: 'support@firefly-core.ir' })).toHaveAttribute(
      'href',
      'mailto:support@firefly-core.ir',
    )
    expect(info.getByText('تهران، خیابان ولیعصر')).toBeInTheDocument()
    expect(info.getByRole('link', { name: 'مشاهده روی نقشه' })).toHaveAttribute(
      'href',
      'https://maps.google.com/?q=35.7564,51.4100',
    )
    expect(info.getByText('شنبه تا چهارشنبه ۹ تا ۱۸')).toBeInTheDocument()
    // The support link is this page: not offered here.
    expect(info.queryByRole('link', { name: /پشتیبانی/ })).toBeNull()
  })

  it('throws when the subjects cannot be read (the error page)', async () => {
    mocks.apiFetch.mockImplementation((path: string) =>
      path === 'contact-us/subject/list'
        ? Promise.reject(new ApiError({ status: 503, code: 'http_503' }))
        : ok(CONTACT_PAGE),
    )
    await expect(ContactRoute()).rejects.toBeInstanceOf(ApiError)
  })
})

describe('the contact page’s head', () => {
  it('the page’s title and meta rows, canonical /contact-us/ (over the page’s own canonical)', async () => {
    answer()
    const metadata = await generateMetadata()
    expect(metadata.title).toEqual({ absolute: 'تماس با ما | فایرفلای' })
    expect(metadata.alternates).toEqual({ canonical: '/contact-us/' })
    expect(metadata.other).toEqual({ author: ['فایرفلای'] })
    expect(metadata.robots).toBeUndefined()
  })

  it('without the page: its own title and description', async () => {
    answer({ page: null })
    const metadata = await generateMetadata()
    expect(metadata.title).toEqual({ absolute: 'تماس با ما | فایرفلای' })
    expect(metadata.description).toBe(
      'راه\u{200C}های تماس با فایرفلای: تلفن، ایمیل، آدرس و فرم ارسال پیام.',
    )
    expect(metadata.alternates).toEqual({ canonical: '/contact-us/' })
  })
})
