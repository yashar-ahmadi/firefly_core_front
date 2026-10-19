import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BlogHomePage, { generateMetadata } from '@/app/(shop)/blog/page'
import { ApiError } from '@/lib/api/errors'
import type { BlogHome } from '@/lib/api/types/blog'
import { stubBrowserApis } from '../support/dom-stubs'
import { categoryListItem, postsFixture } from './fixtures'
import { paginated, renderTree, thrown } from './page-support'

// `/blog/` (blog digest §1.3–1.4): on its first page the featured posts, the latest posts with
// the pager, the products and the recent posts beside them; a later page or a search is the
// archive alone. Every section of the composition may be empty. Pages past the last are 404.

const mocks = vi.hoisted(() => ({
  getBlogHome: vi.fn(),
  getBlogPosts: vi.fn(),
  getBlogCategories: vi.fn(),
  getMenu: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/features/blog/api', () => ({
  getBlogHome: mocks.getBlogHome,
  getBlogPosts: mocks.getBlogPosts,
  getBlogCategories: mocks.getBlogCategories,
}))
vi.mock('@/lib/edge/blog-switch', () => ({ noteBlogOff: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: vi.fn(() => new Promise(() => {})) }))
vi.mock('@/features/settings/api', () => ({
  getMenu: mocks.getMenu,
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

const props = (sp: Record<string, string> = {}) => ({ searchParams: Promise.resolve(sp) })

function home(overrides: Partial<BlogHome> = {}): BlogHome {
  return {
    featured_posts: postsFixture(3, 101),
    recent_posts: postsFixture(5, 201),
    recent_products: [
      {
        id: 1,
        name: 'گلکسی S25 اولترا',
        slug: 'samsung-galaxy-s25-ultra',
        image: 'https://api.shop.ir/static/defaults/default.png',
        in_stock: true,
        price: 80_000_000,
        final_price: 78_500_000,
        has_discount: true,
        discount_percent: 2,
        is_in_wishlist: false,
      },
    ],
    ...overrides,
  }
}

const featured = () => screen.queryByRole('region', { name: 'مطالب ویژه' })
const archive = () => screen.getByRole('region', { name: /مطالب$/ })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getBlogHome.mockResolvedValue(home())
  mocks.getBlogPosts.mockResolvedValue(paginated(postsFixture(12), { count: 19, pages: 2 }))
  mocks.getBlogCategories.mockResolvedValue([
    categoryListItem(1, 'tech-news', null, 'اخبار فناوری'),
    categoryListItem(6, 'tech-news/mobile-blog', 1, 'گوشی و موبایل'),
    categoryListItem(2, 'tutorial', null, 'آموزش'),
  ])
  mocks.getMenu.mockResolvedValue([])
})

describe('the blog home', () => {
  it('composes the featured posts, the latest posts with their pager, the products and the recent posts', async () => {
    await renderTree(await BlogHomePage(props()))
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'وبلاگ' })).toBeInTheDocument()
    expect(within(featured()!).getAllByRole('article')).toHaveLength(3)
    expect(within(archive()).getAllByRole('article')).toHaveLength(12)
    expect(
      within(archive()).getByRole('heading', { level: 2, name: 'تازه‌ترین مطالب' }),
    ).toBeVisible()
    const pager = screen.getByRole('navigation', { name: 'صفحه‌بندی' })
    expect(within(pager).getByRole('link', { name: 'صفحه بعدی' })).toHaveAttribute(
      'href',
      '/blog/?page=2',
    )
    expect(screen.getByRole('region', { name: 'محصولات پیشنهادی' })).toHaveTextContent('۷۸٬۵۰۰٬۰۰۰')
    expect(screen.getByRole('region', { name: 'مطالب اخیر' })).toBeInTheDocument()
    expect(mocks.getBlogPosts).toHaveBeenCalledWith({})
  })

  it('a chip per top-level category, and the categories as a tree beside the posts', async () => {
    await renderTree(await BlogHomePage(props()))
    const chips = screen.getByRole('navigation', { name: 'دسته‌بندی‌های وبلاگ' })
    expect(
      within(chips)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/blog/category/tech-news/', '/blog/category/tutorial/'])
    const tree = screen.getByRole('region', { name: 'دسته‌بندی‌ها' })
    expect(within(tree).getByRole('link', { name: 'گوشی و موبایل' })).toHaveAttribute(
      'href',
      '/blog/category/tech-news/mobile-blog/',
    )
  })

  it('leaves out each section of the composition that is empty', async () => {
    mocks.getBlogHome.mockResolvedValue(
      home({ featured_posts: [], recent_posts: [], recent_products: [] }),
    )
    await renderTree(await BlogHomePage(props()))
    expect(featured()).toBeNull()
    expect(screen.queryByRole('region', { name: 'محصولات پیشنهادی' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'مطالب اخیر' })).toBeNull()
    expect(within(archive()).getAllByRole('article')).toHaveLength(12)
  })

  it.each([1, 2, 3, 4])('lays out %i featured post(s), the first one wide', async (count) => {
    mocks.getBlogHome.mockResolvedValue(home({ featured_posts: postsFixture(count, 101) }))
    await renderTree(await BlogHomePage(props()))
    expect(within(featured()!).getAllByRole('article')).toHaveLength(count)
  })

  it('a later page is the archive alone, the home’s composition not even asked for', async () => {
    mocks.getBlogPosts.mockResolvedValue(
      paginated(postsFixture(7, 13), { count: 19, page: 2, pages: 2 }),
    )
    await renderTree(await BlogHomePage(props({ page: '2' })))
    expect(mocks.getBlogPosts).toHaveBeenCalledWith({ page: 2 })
    expect(mocks.getBlogHome).not.toHaveBeenCalled()
    expect(featured()).toBeNull()
    expect(within(archive()).getAllByRole('article')).toHaveLength(7)
    const pager = screen.getByRole('navigation', { name: 'صفحه‌بندی' })
    expect(within(pager).getByRole('link', { name: 'صفحه قبلی' })).toHaveAttribute('href', '/blog/')
  })

  it.each(['abc', '0', '-1', '1.5'])('?page=%s falls back to the first page', async (page) => {
    await renderTree(await BlogHomePage(props({ page })))
    expect(mocks.getBlogPosts).toHaveBeenCalledWith({})
    expect(featured()).not.toBeNull()
  })

  it('a page past the last answers 404, in the page and its head', async () => {
    mocks.getBlogPosts.mockRejectedValue(
      new ApiError({ status: 404, code: 'not_found', detail: 'صفحه نامعتبر' }),
    )
    expect(await thrown(BlogHomePage(props({ page: '9' })))).toMatchObject({
      message: 'NEXT_NOT_FOUND',
    })
    expect((await generateMetadata(props({ page: '9' }))).title).toEqual({
      absolute: 'صفحه پیدا نشد | فایرفلای',
    })
  })

  it('a search is the archive of its matches, its pager keeping the term', async () => {
    mocks.getBlogPosts.mockResolvedValue(paginated(postsFixture(12), { count: 17, pages: 2 }))
    await renderTree(await BlogHomePage(props({ search: 'ای' })))
    expect(mocks.getBlogPosts).toHaveBeenCalledWith({ search: 'ای' })
    expect(mocks.getBlogHome).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('نتایج جستجو برای «ای»')
    expect(screen.getByText('۱۷ مطلب')).toBeInTheDocument()
    const pager = screen.getByRole('navigation', { name: 'صفحه‌بندی' })
    expect(within(pager).getByRole('link', { name: 'صفحه بعدی' })).toHaveAttribute(
      'href',
      `/blog/?search=${encodeURIComponent('ای')}&page=2`,
    )
  })

  it('a search without a match says so and leads back to the blog', async () => {
    mocks.getBlogPosts.mockResolvedValue(paginated([]))
    await renderTree(await BlogHomePage(props({ search: 'zzz' })))
    expect(screen.getByRole('heading', { level: 2, name: 'مطلبی با «zzz» پیدا نشد' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'همهٔ مطالب وبلاگ' })).toHaveAttribute('href', '/blog/')
  })
})
