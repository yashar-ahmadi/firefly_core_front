import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BlogCategoryPage, {
  generateMetadata as categoryMetadata,
} from '@/app/(shop)/blog/category/[...path]/page'
import BlogHomePage, { generateMetadata as homeMetadata } from '@/app/(shop)/blog/page'
import { BlogUnavailableError } from '@/features/blog/blog-errors'
import { stubBrowserApis } from '../support/dom-stubs'
import { renderTree } from './page-support'

// The blog switched off (Review Focus #1): every blog page shows «وبلاگ موقتاً در دسترس نیست»
// with the operator's reason, never an error page. The proxy answers 503 for it (see
// tests/unit/edge/proxy-blog.test.ts) and tells the page (`x-ff-blog-off`); when the switch is
// turned off after the proxy last read it, the API's refusal of a read says the same, and the
// proxy is told at once (`noteBlogOff`).

const mocks = vi.hoisted(() => ({
  headers: new Headers(),
  noteBlogOff: vi.fn(),
  getBlogHome: vi.fn(),
  getBlogPosts: vi.fn(),
  getBlogCategories: vi.fn(),
  getBlogCategory: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ headers: async () => mocks.headers }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  permanentRedirect: () => {
    throw new Error('NEXT_REDIRECT')
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/features/blog/api', () => ({
  getBlogHome: mocks.getBlogHome,
  getBlogPosts: mocks.getBlogPosts,
  getBlogCategories: mocks.getBlogCategories,
  getBlogCategory: mocks.getBlogCategory,
}))
vi.mock('@/lib/edge/blog-switch', () => ({ noteBlogOff: mocks.noteBlogOff }))
vi.mock('@/features/settings/api', () => ({
  getMenu: async () => [],
  getTranslations: async () => ({}),
  getSiteSettings: async () => ({ name: 'فایرفلای' }),
}))
vi.mock('@/config/store-config', async () => {
  const pure = await import('@/config/resolve-store-config')
  const { parseServerEnv } = await import('@/config/env-schema')
  const env = {
    FIREFLY_API_URL: 'https://api.shop.ir',
    SITE_URL: 'https://shop.ir',
    FIREFLY_API_KEY: 'k',
  }
  return { ...pure, getStoreConfig: () => pure.resolveStoreConfig(parseServerEnv(env)) }
})

stubBrowserApis()

const REASON = 'وبلاگ برای به‌روزرسانی تا فردا بسته است.'
const TITLE = 'وبلاگ موقتاً در دسترس نیست'
const home = () => ({ searchParams: Promise.resolve({}) })
const category = () => ({
  params: Promise.resolve({ path: ['tech-news', 'mobile-blog'] }),
  searchParams: Promise.resolve({}),
})
const NOINDEX = {
  title: { absolute: `${TITLE} | فایرفلای` },
  robots: { index: false, follow: false },
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.headers = new Headers()
  const refused = new BlogUnavailableError(REASON)
  for (const loader of [
    'getBlogHome',
    'getBlogPosts',
    'getBlogCategories',
    'getBlogCategory',
  ] as const) {
    mocks[loader].mockRejectedValue(refused)
  }
})

describe('the proxy found the switch off (the response is a 503)', () => {
  it.each([
    ['the home', () => BlogHomePage(home()), () => homeMetadata(home())],
    ['a category', () => BlogCategoryPage(category()), () => categoryMetadata(category())],
  ])(
    '%s shows the page with the operator’s reason, asking the API nothing',
    async (_, page, meta) => {
      mocks.headers = new Headers({ 'x-ff-blog-off': encodeURIComponent(REASON) })
      await renderTree(await page())
      expect(screen.getByRole('heading', { level: 1, name: TITLE })).toBeInTheDocument()
      expect(screen.getByText(REASON)).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'بازگشت به صفحه\u{0654} اصلی' })).toHaveAttribute(
        'href',
        '/',
      )
      for (const loader of ['getBlogHome', 'getBlogPosts', 'getBlogCategory'] as const) {
        expect(mocks[loader]).not.toHaveBeenCalled()
      }
      expect(await meta()).toEqual(NOINDEX)
    },
  )

  it('without a reason from the operator: a calm sentence of its own', async () => {
    mocks.headers = new Headers({ 'x-ff-blog-off': '' })
    await renderTree(await BlogHomePage(home()))
    expect(screen.getByRole('heading', { level: 1, name: TITLE })).toBeInTheDocument()
    expect(screen.getByText(/به‌زودی برمی‌گردیم/)).toBeInTheDocument()
  })
})

describe('the switch turned off after the proxy read it (a reader is on the blog)', () => {
  it.each([
    ['the home', () => BlogHomePage(home()), () => homeMetadata(home())],
    ['a category', () => BlogCategoryPage(category()), () => categoryMetadata(category())],
  ])('%s: the API’s refusal shows the same page, and the proxy is told', async (_, page, meta) => {
    await renderTree(await page())
    expect(screen.getByRole('heading', { level: 1, name: TITLE })).toBeInTheDocument()
    expect(screen.getByText(REASON)).toBeInTheDocument()
    expect(mocks.noteBlogOff).toHaveBeenCalledWith({ reason: REASON })
    expect(await meta()).toEqual(NOINDEX)
  })

  it('any other failure is no switch: it reaches the error boundary', async () => {
    mocks.getBlogCategory.mockRejectedValue(new Error('upstream exploded'))
    await expect(BlogCategoryPage(category())).rejects.toThrow('upstream exploded')
    expect(mocks.noteBlogOff).not.toHaveBeenCalled()
  })
})
