import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BlogPostPage, { generateMetadata } from '@/app/(shop)/blog/[slug]/page'
import type { PostDetail } from '@/lib/api/types/blog-post'
import { stubBrowserApis } from '../support/dom-stubs'
import { categoryListItem } from './fixtures'
import { jsonLdBlocks, paginated, renderTree } from './page-support'
import { liveThreads, postDetailFixture } from './post-fixtures'

// What `/blog/<slug>/` shows and says of itself (blog digest §1.5, §1.9): the article, its
// banner only when there is one, its content with the API's heading ids, the staff preview, the
// head and the JSON-LD; related posts never prefetched.

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-real-ip': '5.6.7.8' }),
  cookies: async () => ({ get: () => undefined }),
}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('next/link', async () => {
  const { createElement } = await import('react')
  return {
    default: ({ prefetch, ...props }: { prefetch?: boolean | null; href: string }) =>
      createElement('a', {
        ...props,
        'data-prefetch': prefetch === undefined ? 'auto' : String(prefetch),
      }),
  }
})
vi.mock('@/lib/api/server', () => ({ apiFetch: mocks.apiFetch }))
vi.mock('@/lib/api/client', () => ({ bffFetch: vi.fn(() => new Promise(() => {})) }))
vi.mock('@/lib/edge/blog-switch', () => ({ noteBlogOff: vi.fn() }))
vi.mock('@/features/settings/api', () => ({
  getTranslations: async () => ({}),
  getSiteSettings: async () => ({ name: 'فایرفلای' }),
}))
vi.mock('@/config/env', async () => {
  const { parseServerEnv } = await import('@/config/env-schema')
  const env = parseServerEnv({
    FIREFLY_API_URL: 'https://api.shop.ir',
    SITE_URL: 'https://shop.ir',
  })
  return { getServerEnv: () => env }
})
vi.mock('@/config/store-config', async () => {
  const pure = await import('@/config/resolve-store-config')
  const { parseServerEnv } = await import('@/config/env-schema')
  const env = { FIREFLY_API_URL: 'https://api.shop.ir', SITE_URL: 'https://shop.ir' }
  return { ...pure, getStoreConfig: () => pure.resolveStoreConfig(parseServerEnv(env)) }
})

stubBrowserApis()

const props = { params: Promise.resolve({ slug: 'best-phones-under-30m' }) }
const ok = (data: unknown) =>
  Promise.resolve({ data, msg: '', status: 200, headers: new Headers() })
const CATEGORIES = [
  categoryListItem(10001, 'tech-news', null, 'اخبار فناوری'),
  categoryListItem(10006, 'tech-news/mobile-blog', 10001, 'گوشی و موبایل'),
  categoryListItem(10002, 'buying-guide', null, 'راهنمای خرید'),
]

function answer(post: PostDetail) {
  mocks.apiFetch.mockImplementation((path: string) => {
    if (path === 'blog/post/best-phones-under-30m') return ok(post)
    if (path === 'blog/category/list') return ok(paginated(CATEGORIES))
    if (path.endsWith('/comment/list')) return ok(paginated(liveThreads()))
    return Promise.reject(new Error(path))
  })
}

async function show(overrides: Partial<PostDetail> = {}) {
  answer(postDetailFixture(overrides))
  return renderTree(await BlogPostPage(props))
}

const article = () => screen.getByRole('article', { name: postDetailFixture().name })

beforeEach(() => {
  mocks.apiFetch.mockReset()
})

describe('the post’s article', () => {
  it('its title, author, Jalali dates, reading time and views, in Persian digits', async () => {
    await show({
      content: `<p>${'واژه '.repeat(401)}</p>`,
      headings: [],
      updated: '2026-09-20T10:00:00+03:30',
    })
    const head = within(article()).getByRole('banner')
    expect(within(head).getByRole('heading', { level: 1 })).toHaveAttribute('dir', 'auto')
    expect(head).toHaveTextContent('مدیر فروشگاه')
    expect(head).toHaveTextContent('۱۰ شهریور ۱۴۰۵')
    expect(head).toHaveTextContent('به\u{200C}روزرسانی ۲۹ شهریور ۱۴۰۵')
    expect(head).toHaveTextContent('۳ دقیقه مطالعه')
    expect(head).toHaveTextContent('۴٬۸۲۳ بازدید')
    expect(within(head).getByRole('link', { name: 'گوشی و موبایل' })).toHaveAttribute(
      'href',
      '/blog/category/tech-news/mobile-blog/',
    )
    // One h1 on the page.
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('a banner only when the API has one, never the square picture instead', async () => {
    const banner = () =>
      [...document.querySelectorAll('img')].find((img) => /banner|best-phones\.jpg/.test(img.src))
    await show()
    expect(decodeURIComponent(banner()!.src)).toContain('best-phones-banner.png')
    document.body.innerHTML = ''
    await show({ banner: null })
    expect(banner()).toBeUndefined()
  })

  it('its content, sanitised, with the API’s heading ids and its media on the API host', async () => {
    await show({
      content: `${postDetailFixture().content}<script>alert(1)</script><p onclick="x()">متن</p>`,
    })
    expect(document.getElementById('باتری')?.tagName).toBe('H3')
    expect(article().querySelector('script')).toBeNull()
    expect(article().querySelector('[onclick]')).toBeNull()
    expect(
      article().querySelector('img[src="https://api.shop.ir/media/posts/phones.jpg"]'),
    ).not.toBeNull()
    expect(within(article()).getByRole('link', { name: 'راهنما' })).toHaveAttribute(
      'href',
      '/blog/category/buying-guide/',
    )
    expect(within(article()).getByRole('navigation', { name: 'فهرست مطالب' })).toBeInTheDocument()
  })

  it('no table of contents without two headings to list', async () => {
    await show({ headings: postDetailFixture().headings.slice(0, 1) })
    expect(screen.queryByRole('navigation', { name: 'فهرست مطالب' })).toBeNull()
  })

  it('a staff preview: the bar, no sharing, no comments (their lists answer 404)', async () => {
    await show({ is_unpublished: true, published_at: null })
    expect(screen.getByRole('status')).toHaveTextContent(
      'پیش\u{200C}نمایش — این پست هنوز منتشر نشده است',
    )
    expect(screen.queryByRole('button', { name: 'اشتراک\u{200C}گذاری' })).toBeNull()
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(mocks.apiFetch.mock.calls.some(([path]) => path.endsWith('/comment/list'))).toBe(false)
  })

  it('related posts never prefetch their links; related products are tiles', async () => {
    await show()
    const related = screen.getByRole('region', { name: 'مطالب مرتبط' })
    const link = within(related).getByRole('link', { name: 'بررسی S25' })
    expect(link).toHaveAttribute('href', '/blog/galaxy-s25-ultra-review/')
    expect(link).toHaveAttribute('data-prefetch', 'false')
    const products = screen.getByRole('region', { name: 'محصولات مرتبط' })
    expect(within(products).getByRole('link', { name: /ردمی نوت/ })).toHaveAttribute(
      'href',
      '/product/xiaomi-redmi-note-14-pro/',
    )
  })

  it('the comments: two tabs, page 1 from the anonymous cached read', async () => {
    await show()
    expect(screen.getAllByRole('tab')).toHaveLength(2)
    expect(screen.getByRole('list', { name: 'دیدگاه\u{200C}ها' })).toBeInTheDocument()
    const [, options] = mocks.apiFetch.mock.calls.find(([path]) => path.endsWith('/comment/list'))!
    expect(options).toMatchObject({ query: { comment_type: 'comment', page: 1 }, revalidate: 60 })
    expect(options).not.toHaveProperty('token')
  })
})

describe('the post’s head', () => {
  it('title, description, keywords, a self canonical with its slash, Open Graph article', async () => {
    answer(postDetailFixture())
    const meta = await generateMetadata(props)
    expect(meta.title).toEqual({ absolute: postDetailFixture().page_title })
    expect(meta.description).toBe(postDetailFixture().page_description)
    expect(meta.keywords).toBe('بهترین, گوشی')
    expect(meta.alternates).toEqual({ canonical: '/blog/best-phones-under-30m/' })
    expect(meta.openGraph).toMatchObject({
      type: 'article',
      images: [postDetailFixture().image],
      publishedTime: '2026-09-01T15:00:00+03:30',
      authors: ['مدیر فروشگاه'],
    })
    expect(meta.robots).toBeUndefined()
  })

  it('an unset description ("") falls back to the post’s own; the operator’s canonical path gets its slash', async () => {
    answer(postDetailFixture({ page_description: '', canonical_link: '/blog/phones?ref=x' }))
    const meta = await generateMetadata(props)
    expect(meta.description).toBe(postDetailFixture().description)
    expect(meta.alternates).toEqual({ canonical: '/blog/phones/?ref=x' })
  })

  it('a staff preview is never indexed', async () => {
    answer(postDetailFixture({ is_unpublished: true }))
    expect((await generateMetadata(props)).robots).toEqual({ index: false, follow: false })
  })

  it('JSON-LD: the BlogPosting and the trail on the shop’s origin, escaped, the body as text', async () => {
    await show()
    const [posting, trail] = jsonLdBlocks()
    expect(posting!.raw).not.toContain('</script>')
    expect(posting!.raw).toContain('\\u003c/script>')
    expect(posting!.data).toMatchObject({
      '@type': 'BlogPosting',
      mainEntityOfPage: { '@id': 'https://shop.ir/blog/best-phones-under-30m/' },
      image: 'https://shop.ir/media/CACHE/images/posts/best-phones.jpg',
      publisher: { logo: { url: 'https://shop.ir/media/site-logo.png' } },
      articleBody: 'اگر بودجه شما حدود ۳۰ میلیون تومان است. چرا؟',
    })
    expect(trail!.data).toMatchObject({ '@type': 'BreadcrumbList' })
    expect(JSON.stringify(trail!.data)).not.toContain('https://localhost')
  })
})
