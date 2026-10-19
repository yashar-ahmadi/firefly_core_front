import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ContentPageRoute from '@/app/(shop)/page/[slug]/page'
import { clearMissing } from '@/features/catalog/loaders/missing'
import { renderTree, thrown } from '../blog/page-support'
import { stubBrowserApis } from '../support/dom-stubs'
import { answerPages, readsOf, type PageApi } from './page-api-mock'
import { pageComment, pageFixture } from './page-fixtures'

// `/page/<slug>/` (content digest §3.2): the operator's page in one of three layouts (`default`,
// `full_width`, `with_sidebar` with an aside listing the other pages; anything else is
// `default`), its `property=` meta rows rendered by the page, its comments when they are open or
// some exist, the contact form's slot under `contact-us`, and real 404s.

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
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/lib/api/server', () => ({ apiFetch: mocks.apiFetch }))
// The contact form's slot renders nothing until Task 4: a marker shows where it is placed.
vi.mock('@/features/content/pages/contact-slot', async () => {
  const { createElement } = await import('react')
  return { ContactFormSlot: () => createElement('div', { 'data-slot': 'contact-form' }) }
})
vi.mock('@/lib/api/client', () => ({ bffFetch: vi.fn(() => new Promise(() => {})) }))
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
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/page/contact-us/',
      '/page/privacy/',
      '/page/terms/',
    ])
    // Below the content on phones: it follows the article in the document.
    expect(article().compareDocumentPosition(aside) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const [[, options]] = readsOf(mocks.apiFetch, 'pages/list')
    expect(options).toMatchObject({ query: { limit: 100 }, revalidate: 300 })
    expect(options).not.toHaveProperty('token')
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

  it('contact-us: the contact form’s slot (Task 4) right under the content, in the article', async () => {
    await show({
      page: pageFixture({
        slug: 'contact-us',
        title: 'درباره ما',
        enable_comments: false,
        comment_count: 0,
      }),
    })
    const slot = document.querySelector('[data-slot="contact-form"]')
    expect(slot).not.toBeNull()
    expect(article().lastElementChild).toBe(slot)
  })

  it('no contact slot on another page', async () => {
    await show({ page: pageFixture() })
    expect(document.querySelector('[data-slot="contact-form"]')).toBeNull()
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
