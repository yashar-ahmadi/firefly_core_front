import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ContentPageRoute from '@/app/(shop)/page/[slug]/page'
import { clearMissing } from '@/features/catalog/loaders/missing'
import { ApiError } from '@/lib/api/errors'
import type { PageBlock } from '@/lib/api/types/page'
import { renderTree, thrown } from '../blog/page-support'
import { stubBrowserApis } from '../support/dom-stubs'
import { answerPages, readsOf, type PageApi } from './page-api-mock'
import { pageComment, pageFixture } from './page-fixtures'

// `/page/<slug>/` (content digest §3.2): the operator's page in one of three layouts (`default`,
// `full_width`, `with_sidebar` with an aside listing the other pages; anything else is
// `default`), its `property=` meta rows rendered by the page, its comments when they are open or
// some exist, and real 404s. (`contact-us` is never rendered here: `/page/contact-us/` redirects
// to the contact page, `/contact-us/`, which shows its content above the form.)

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn(), cookies: new Map<string, string>() }))

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-real-ip': '5.6.7.8' }),
  cookies: async () => ({
    get: (name: string) =>
      mocks.cookies.has(name) ? { name, value: mocks.cookies.get(name) } : undefined,
  }),
}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`)
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/lib/api/server', () => ({ apiFetch: mocks.apiFetch }))
vi.mock('@/lib/api/client', () => ({ bffFetch: vi.fn(() => new Promise(() => {})) }))
vi.mock('@/features/settings/api', () => ({
  getTranslations: async () => ({}),
  getSiteSettings: async () => ({
    name: 'فایرفلای',
    phone: '+982191000000',
    sales_phone: '+982191000100',
  }),
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

async function show(api: PageApi, slug = api.page?.slug ?? 'about-us') {
  answerPages(mocks.apiFetch, api)
  return renderTree(await ContentPageRoute({ params: Promise.resolve({ slug }) }))
}

const frame = () => document.querySelector<HTMLElement>('[data-layout]')!
const article = () => screen.getByRole('article', { name: 'درباره ما' })
const comments = () => screen.queryByRole('region', { name: 'دیدگاه\u{200C}ها و پرسش\u{200C}ها' })

beforeEach(() => {
  mocks.apiFetch.mockReset()
  mocks.cookies.clear()
  clearMissing()
  document.head.innerHTML = ''
})

describe('a content page’s layout', () => {
  it('with_sidebar: the text, then an aside listing the other pages (not this one)', async () => {
    await show({ page: pageFixture({ layout: 'with_sidebar' }) })
    expect(frame().dataset.layout).toBe('with_sidebar')
    const aside = screen.getByRole('complementary', { name: 'صفحه\u{200C}های دیگر' })
    expect(aside.tagName).toBe('ASIDE')
    const links = within(aside).getAllByRole('link')
    // The contact-us page's home is the contact page (no redirect hop).
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/contact-us/',
      '/page/privacy/',
      '/page/terms/',
    ])
    // Below the content on phones: it follows the article in the document.
    expect(article().compareDocumentPosition(aside) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const [[, options]] = readsOf(mocks.apiFetch, 'pages/list')
    expect(options).toMatchObject({ query: { limit: 100 }, revalidate: 300 })
    expect(options).not.toHaveProperty('token')
  })

  it('with_sidebar: a page for signed-in visitors only has a lock named «ویژهٔ اعضا»', async () => {
    const list = [
      { id: 4, title: 'باشگاه', slug: 'club', url: '/page/club/', requires_login: true },
      { id: 3, title: 'قوانین', slug: 'terms', url: '/page/terms/', requires_login: false },
    ]
    await show({ page: pageFixture({ layout: 'with_sidebar' }), list })
    const aside = screen.getByRole('complementary', { name: 'صفحه\u{200C}های دیگر' })
    const club = within(aside).getByRole('link', { name: /باشگاه/ })
    expect(within(club).getByRole('img', { name: 'ویژه\u{0654} اعضا' })).toBeInTheDocument()
    expect(
      within(within(aside).getByRole('link', { name: /قوانین/ })).queryByRole('img'),
    ).toBeNull()
  })

  it('default: one readable column, no aside, no list read', async () => {
    await show({ page: pageFixture() })
    expect(frame().dataset.layout).toBe('default')
    expect(screen.queryByRole('complementary')).toBeNull()
    expect(readsOf(mocks.apiFetch, 'pages/list')).toEqual([])
    expect(article().querySelector('.rich-content')).not.toHaveClass('rich-content-wide')
  })

  it('an unknown layout renders as default', async () => {
    await show({ page: pageFixture({ layout: 'two_columns' }) })
    expect(frame().dataset.layout).toBe('default')
    expect(screen.queryByRole('complementary')).toBeNull()
  })

  it('full_width: the whole width; a wide table scrolls in its own labelled region', async () => {
    const table =
      '<table><tr><th>اندازه</th><th>دور سینه</th></tr><tr><td>M</td><td>۹۶</td></tr></table>'
    await show({ page: pageFixture({ layout: 'full_width', content: table }) })
    expect(frame().dataset.layout).toBe('full_width')
    // Its pictures keep their width too, each scrolling in its own box (rich-content.css).
    expect(article().querySelector('.rich-content')).toHaveClass('rich-content-wide')
    const region = within(article()).getByRole('region', { name: 'جدول' })
    expect(region).toHaveAttribute('tabindex', '0')
    expect(within(region).getByRole('table')).toBeInTheDocument()
  })

  it('full_width: a wide picture scrolls in its own labelled region, as a table does', async () => {
    const content = '<p><img src="/media/size-chart.png" alt="جدول اندازه"></p>'
    await show({ page: pageFixture({ layout: 'full_width', content }) })
    const region = within(article()).getByRole('region', { name: 'تصویر' })
    expect(region).toHaveAttribute('tabindex', '0')
    expect(within(region).getByRole('img', { name: 'جدول اندازه' })).toBeInTheDocument()
  })

  it('default: the same picture fits the column, with no region of its own', async () => {
    const content = '<p><img src="/media/size-chart.png" alt="جدول اندازه"></p>'
    await show({ page: pageFixture({ content }) })
    expect(within(article()).getByRole('img', { name: 'جدول اندازه' })).toBeInTheDocument()
    expect(within(article()).queryByRole('region')).toBeNull()
  })
})

describe('a content page’s content', () => {
  it('its one h1 is the title; the content sanitised, /media on the API', async () => {
    await show({
      page: pageFixture({
        content: '<h1>عنوان</h1><p onclick="x()">متن</p><img src="/media/a.png"><script>1</script>',
      }),
    })
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('درباره ما')
    expect(article().querySelector('script, [onclick]')).toBeNull()
    expect(article().querySelector('img')).toHaveAttribute('src', 'https://api.shop.ir/media/a.png')
  })

  it('meta_tags with og:image render meta[property="og:image"], in order, repeats kept', async () => {
    await show({
      page: pageFixture({
        meta_tags: [
          { field: 'og:image', value: 'https://cdn.shop.ir/a.png' },
          { field: 'twitter:card', value: 'summary' },
          { field: 'og:image', value: 'https://cdn.shop.ir/b.png' },
        ],
      }),
    })
    const images = [...document.head.querySelectorAll('meta[property="og:image"]')]
    expect(images.map((tag) => tag.getAttribute('content'))).toEqual([
      'https://cdn.shop.ir/a.png',
      'https://cdn.shop.ir/b.png',
    ])
    // `name=` rows go through the metadata (`other`), never as property tags.
    expect(document.head.querySelector('meta[property="twitter:card"]')).toBeNull()
  })
})

describe('a content page’s comments block', () => {
  it('hidden when enable_comments is false and the counts are 0: nothing read', async () => {
    await show({
      page: pageFixture({ enable_comments: false, comment_count: 0, question_count: 0 }),
    })
    expect(comments()).toBeNull()
    expect(readsOf(mocks.apiFetch, 'pages/about-us/comment')).toEqual([])
  })

  it('open: the tabs with the counts, page 1 server-rendered from the anonymous cached read', async () => {
    await show({ page: pageFixture(), comments: [pageComment()] })
    const section = comments()!
    expect(within(section).getAllByRole('tab')[0]).toHaveAccessibleName(
      'دیدگاه\u{200C}ها (۱ دیدگاه)',
    )
    expect(within(section).getByText('صفحهٔ خوبی است.')).toBeInTheDocument()
    expect(within(section).getByRole('button', { name: 'ثبت دیدگاه' })).toBeInTheDocument()
    const [[, options]] = readsOf(mocks.apiFetch, 'pages/about-us/comment/list')
    expect(options).toMatchObject({ query: { comment_type: 'comment', page: 1 }, revalidate: 60 })
    expect(options).not.toHaveProperty('token')
  })

  it('closed with old comments: the list stays, the form does not', async () => {
    await show({
      page: pageFixture({ enable_comments: false, comment_count: 1 }),
      comments: [pageComment()],
    })
    const section = comments()!
    expect(within(section).getByText('صفحهٔ خوبی است.')).toBeInTheDocument()
    expect(within(section).queryByRole('button', { name: /ثبت دیدگاه|پاسخ/ })).toBeNull()
    expect(section).toHaveTextContent('ثبت دیدگاه و پرسش برای این صفحه بسته است.')
  })
})

describe('a content page that is not there', () => {
  it('a missing page or a draft (for a guest) is a real 404', async () => {
    expect(await thrown(show({ page: null }, 'no-such-page'))).toHaveProperty(
      'message',
      'NEXT_NOT_FOUND',
    )
  })

  it('`list` is the API’s pages list, never a page: 404 without a read', async () => {
    expect(await thrown(show({ page: pageFixture() }, 'list'))).toHaveProperty(
      'message',
      'NEXT_NOT_FOUND',
    )
    expect(mocks.apiFetch).not.toHaveBeenCalled()
  })

  it('a Persian slug is percent-encoded once for the API', async () => {
    const page = pageFixture({ slug: 'شرایط-ارسال', title: 'درباره ما' })
    await show({ page }, encodeURIComponent('شرایط-ارسال'))
    const [[path]] = readsOf(mocks.apiFetch, 'pages/')
    expect(path).toBe(`pages/${encodeURIComponent('شرایط-ارسال')}`)
  })
})

describe('a staff preview of a draft', () => {
  it('read again with the staff token, uncached: the bar, no comments (their lists answer 404)', async () => {
    mocks.cookies.set('ff_at', 'aaa.bbb.ccc')
    await show({ page: null, staffPage: pageFixture({ is_unpublished: true }) }, 'about-us')
    expect(screen.getByRole('status')).toHaveTextContent('پیش\u{200C}نویس — منتشر نشده')
    expect(comments()).toBeNull()
    // [token, revalidate, visitor IP]: everyone's read is anonymous and cached, so it never
    // carries an IP (it would split the cache per visitor); the uncached preview carries hers.
    const reads = readsOf(mocks.apiFetch, 'pages/about-us').map(([, options]) => [
      options.token ?? null,
      options.revalidate ?? null,
      options.forwardedFor ?? null,
    ])
    expect(reads).toEqual([
      [null, 300, null],
      ['aaa.bbb.ccc', null, '5.6.7.8'],
    ])
  })
})

describe('a page for signed-in visitors only', () => {
  const members = pageFixture({ requires_login: true, title: 'باشگاه مشتریان', slug: 'club' })

  it('sends a guest to login and back, with no token read and nothing rendered', async () => {
    const error = await thrown(show({ page: null, loginOnly: true }, 'club'))
    expect(error).toHaveProperty('message', 'NEXT_REDIRECT /login/?next=/page/club/')
    expect(readsOf(mocks.apiFetch, 'pages/club').map(([, o]) => o.token ?? null)).toEqual([null])
  })

  it('remembers the 401 a minute: a second guest costs no API call', async () => {
    await thrown(show({ page: null, loginOnly: true }, 'club'))
    mocks.apiFetch.mockClear()
    await thrown(show({ page: null, loginOnly: true }, 'club'))
    expect(readsOf(mocks.apiFetch, 'pages/')).toEqual([])
  })

  it('reads it again with a signed-in visitor’s token, uncached, with the members’ pill', async () => {
    mocks.cookies.set('ff_at', 'aaa.bbb.ccc')
    await show({ page: null, loginOnly: true, memberPage: members }, 'club')
    expect(screen.getByRole('heading', { level: 1, name: 'باشگاه مشتریان' })).toBeInTheDocument()
    expect(screen.getByText('ویژه\u{0654} اعضا')).toBeInTheDocument()
    const reads = readsOf(mocks.apiFetch, 'pages/club').map(([, options]) => [
      options.token ?? null,
      options.revalidate ?? null,
    ])
    expect(reads).toEqual([
      [null, 300],
      ['aaa.bbb.ccc', null],
    ])
    // Its comments are read in the browser, with the session: no anonymous server read.
    expect(readsOf(mocks.apiFetch, 'pages/club/comment')).toEqual([])
  })

  it('sends a visitor whose token the API refuses to login', async () => {
    mocks.cookies.set('ff_at', 'aaa.bbb.ccc')
    const error = await thrown(show({ page: null, loginOnly: true, memberPage: 'refused' }, 'club'))
    expect(error).toHaveProperty('message', 'NEXT_REDIRECT /login/?next=/page/club/')
  })

  it('is a 404 when the token read finds no page (deleted meanwhile)', async () => {
    mocks.cookies.set('ff_at', 'aaa.bbb.ccc')
    const error = await thrown(show({ page: null, loginOnly: true, memberPage: null }, 'club'))
    expect(error).toHaveProperty('message', 'NEXT_NOT_FOUND')
  })

  it('a refused API key is a fault, never a login: the error page', async () => {
    mocks.apiFetch.mockRejectedValue(
      new ApiError({ status: 401, code: 'api_key_invalid', detail: 'کلید نامعتبر است.' }),
    )
    const error = await thrown(ContentPageRoute({ params: Promise.resolve({ slug: 'club' }) }))
    expect(error).toBeInstanceOf(ApiError)
  })
})

describe('a content page’s blocks', () => {
  const block = (overrides: Partial<PageBlock>): PageBlock => ({
    id: 1,
    type: 'rich_text',
    style: 'style_1',
    placement: 'after_content',
    title: '',
    subtitle: null,
    content: null,
    image: null,
    mobile_image: null,
    alt: null,
    video_url: null,
    link: null,
    items: null,
    ...overrides,
  })

  it('draws the blocks above and below the content, the title heading the page', async () => {
    await show({
      page: pageFixture({
        blocks: [
          block({ id: 1, placement: 'before_content', title: 'بالای متن', content: '<p>یک</p>' }),
          block({ id: 2, title: 'پایین متن', content: '<p>دو</p>' }),
        ],
      }),
    })
    const [above, below] = ['بالای متن', 'پایین متن'].map((name) =>
      screen.getByRole('heading', { level: 2, name }).closest('[data-block]')!,
    )
    const text = document.querySelector('article .rich-content')!
    expect(above.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(text.compareDocumentPosition(below) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // With blocks above the text, the title heads the page, outside the article.
    const title = screen.getByRole('heading', { level: 1, name: 'درباره ما' })
    expect(title.closest('article')).toBeNull()
  })

  it('a page of blocks only (no content) has its title and blocks, no empty article', async () => {
    await show({
      page: pageFixture({
        content: null,
        blocks: [block({ title: 'متن', content: '<p>تنها بلوک</p>' })],
      }),
    })
    expect(screen.getByRole('heading', { level: 1, name: 'درباره ما' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'درباره ما' })).toBeNull()
    expect(screen.getByText('تنها بلوک')).toBeInTheDocument()
  })

  it('skips a block of a type this storefront does not know', async () => {
    await show({
      page: pageFixture({ blocks: [block({ type: 'countdown', title: 'شمارنده' })] }),
    })
    expect(screen.queryByText('شمارنده')).toBeNull()
  })

  it('fills the contact block from the settings: support and sales lines', async () => {
    await show({
      page: pageFixture({ blocks: [block({ type: 'contact_info', title: 'راه‌های ارتباط' })] }),
    })
    const region = screen.getByRole('region', { name: 'راه‌های ارتباط' })
    expect(within(region).getByRole('link', { name: '۰۲۱ ۹۱۰۰ ۰۰۰۰' })).toBeInTheDocument()
    expect(within(region).getByRole('link', { name: '۰۲۱ ۹۱۰۰ ۰۱۰۰' })).toBeInTheDocument()
  })
})
