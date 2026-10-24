import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BlogCategoryPage, { generateMetadata } from '@/app/(shop)/blog/category/[...path]/page'
import { ApiError } from '@/lib/api/errors'
import { stubBrowserApis } from '../support/dom-stubs'
import { categoryDetailFixture, categoryListItem, postsFixture } from './fixtures'
import { jsonLdBlocks, paginated, renderTree, thrown } from './page-support'

// `/blog/category/<path>/` (blog digest §1.6, §1.9): the category is checked through its detail
// first (the post list ignores unknown slugs and would list everything), its path is
// canonicalised with a 308 like a product category's, and its posts are the list filtered by it.

const mocks = vi.hoisted(() => ({
  getBlogCategory: vi.fn(),
  getBlogPosts: vi.fn(),
  getBlogCategories: vi.fn(),
}))

class Redirect extends Error {
  constructor(readonly url: string) {
    super('NEXT_REDIRECT')
  }
}

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  permanentRedirect: (url: string) => {
    throw new Redirect(url)
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/features/blog/api', () => mocks)
vi.mock('@/lib/edge/blog-switch', () => ({ noteBlogOff: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: vi.fn(() => new Promise(() => {})) }))
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

const props = (path: string[], sp: Record<string, string> = {}) => ({
  params: Promise.resolve({ path }),
  searchParams: Promise.resolve(sp),
})
const CANONICAL = ['tech-news', 'mobile-blog']

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getBlogCategory.mockResolvedValue(categoryDetailFixture())
  mocks.getBlogPosts.mockResolvedValue(paginated(postsFixture(5), { count: 5 }))
  mocks.getBlogCategories.mockResolvedValue([
    categoryListItem(10001, 'tech-news', null, 'اخبار فناوری'),
    categoryListItem(10006, 'tech-news/mobile-blog', 10001, 'گوشی و موبایل'),
    categoryListItem(10008, 'tech-news/mobile-blog/android', 10006, 'اندروید'),
  ])
})

describe('the blog category route', () => {
  it('looks the category up by its last slug and lists its posts, filtered by it', async () => {
    await renderTree(await BlogCategoryPage(props(CANONICAL)))
    expect(mocks.getBlogCategory).toHaveBeenCalledWith('mobile-blog')
    expect(mocks.getBlogPosts).toHaveBeenCalledWith({ category: 'mobile-blog' })
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'گوشی و موبایل' })).toBeInTheDocument()
    expect(screen.getByText('همه چیز درباره گوشی های هوشمند.')).toBeInTheDocument()
    expect(screen.getByText('۵ مطلب')).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(5)
  })

  it('shows the trail through the blog and the category’s children as chips', async () => {
    await renderTree(await BlogCategoryPage(props(CANONICAL)))
    const trail = screen.getByRole('navigation', { name: 'مسیر صفحه' })
    expect(within(trail).getByRole('link', { name: 'وبلاگ' })).toHaveAttribute('href', '/blog/')
    expect(within(trail).getByRole('link', { name: 'اخبار فناوری' })).toHaveAttribute(
      'href',
      '/blog/category/tech-news/',
    )
    expect(within(trail).getByText('گوشی و موبایل')).toHaveAttribute('aria-current', 'page')
    const chips = screen.getByRole('navigation', { name: 'زیردسته‌ها' })
    expect(within(chips).getByRole('link', { name: 'اندروید' })).toHaveAttribute(
      'href',
      '/blog/category/tech-news/mobile-blog/android/',
    )
  })

  it('an unknown category is a real 404, checked before any post is listed', async () => {
    mocks.getBlogCategory.mockResolvedValue(null)
    expect(await thrown(BlogCategoryPage(props(['no-such'])))).toMatchObject({
      message: 'NEXT_NOT_FOUND',
    })
    expect(mocks.getBlogPosts).not.toHaveBeenCalled()
    expect((await generateMetadata(props(['no-such']))).title).toEqual({
      absolute: 'صفحه پیدا نشد | فایرفلای',
    })
  })

  it('moves a path that is not the category’s own to it with a 308, keeping the query', async () => {
    const error = await thrown(BlogCategoryPage(props(['mobile-blog'], { page: '2' })))
    expect(error).toBeInstanceOf(Redirect)
    expect((error as Redirect).url).toBe('/blog/category/tech-news/mobile-blog/?page=2')
    expect(mocks.getBlogPosts).not.toHaveBeenCalled()
  })

  it('reads the path decoded: an encoded Persian path is the category’s own', async () => {
    mocks.getBlogCategory.mockResolvedValue(
      categoryDetailFixture({ slug: 'گوشی', path: 'اخبار/گوشی' }),
    )
    await BlogCategoryPage(props([encodeURIComponent('اخبار'), encodeURIComponent('گوشی')]))
    expect(mocks.getBlogPosts).toHaveBeenCalledWith({ category: 'گوشی' })
  })

  it('a page past the last is a 404; a later page asks for it', async () => {
    mocks.getBlogPosts.mockRejectedValue(new ApiError({ status: 404, code: 'not_found' }))
    expect(await thrown(BlogCategoryPage(props(CANONICAL, { page: '4' })))).toMatchObject({
      message: 'NEXT_NOT_FOUND',
    })
    expect(mocks.getBlogPosts).toHaveBeenCalledWith({ category: 'mobile-blog', page: 4 })
  })

  it('emits the backend’s CollectionPage and trail on the shop’s origin, every < escaped', async () => {
    await renderTree(await BlogCategoryPage(props(CANONICAL)))
    const blocks = jsonLdBlocks()
    expect(blocks.map((block) => block.data['@type'])).toEqual(['CollectionPage', 'BreadcrumbList'])
    const [collection, trail] = blocks
    expect(collection?.data).toMatchObject({
      url: 'https://shop.ir/blog/category/tech-news/mobile-blog/',
      // Named as the shop names its blog (the backend says «بلاگ»).
      isPartOf: { name: 'وبلاگ فایرفلای', url: 'https://shop.ir/blog/' },
      publisher: { logo: { url: 'https://shop.ir/media/site-logo.png' } },
    })
    expect((trail?.data.itemListElement as { name: string }[])[1]?.name).toBe('وبلاگ')
    // The operator's description held `</script>`: written as `\u003c`, it cannot end the script.
    expect(collection?.raw).not.toContain('</script>')
    expect(collection?.raw).toContain('\\u003c/script>')
    expect(collection?.data.description).toContain('</script>')
    expect(JSON.stringify(trail?.data)).not.toContain('https://localhost')
  })
})

describe('the blog category’s head', () => {
  it('the API’s page_title as an absolute title, the path as canonical, the social cards', async () => {
    const meta = await generateMetadata(props(CANONICAL))
    expect(meta.title).toEqual({ absolute: 'گوشی و موبایل | وبلاگ فایرفلای' })
    expect(meta.alternates?.canonical).toBe('/blog/category/tech-news/mobile-blog/')
    expect(meta.description).toBe('همه چیز درباره گوشی های هوشمند.')
    expect(meta.openGraph).toMatchObject({
      type: 'website',
      title: 'گوشی و موبایل | وبلاگ فایرفلای',
      url: '/blog/category/tech-news/mobile-blog/',
      siteName: 'فایرفلای',
      // On the shop's origin, as the structured data has it (it serves /media/ there too).
      images: ['https://shop.ir/media/CACHE/images/categories/blog-mobile.jpg'],
    })
    expect(meta.robots).toBeUndefined()
  })

  it('a later page is its own canonical, «صفحهٔ N» in its title; an operator canonical wins on page 1', async () => {
    const later = await generateMetadata(props(CANONICAL, { page: '2' }))
    expect(later.title).toEqual({ absolute: 'گوشی و موبایل | وبلاگ فایرفلای - صفحه\u{0654} ۲' })
    expect(later.alternates?.canonical).toBe('/blog/category/tech-news/mobile-blog/?page=2')
    mocks.getBlogCategory.mockResolvedValue(
      categoryDetailFixture({ canonical_link: 'https://shop.ir/blog/category/phones/' }),
    )
    const first = await generateMetadata(props(CANONICAL))
    expect(first.alternates?.canonical).toBe('https://shop.ir/blog/category/phones/')
  })
})
