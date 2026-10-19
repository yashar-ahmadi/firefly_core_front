import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SearchPage, { generateMetadata } from '@/app/(shop)/search/page'
import { ApiError } from '@/lib/api/errors'
import { stubBrowserApis } from '../support/dom-stubs'
import { makeJwt } from '../support/jwt'
import { clientProviders } from '../support/providers'
import { resolveServerTree } from '../support/server-tree'
import { sampleTree } from '../layout/support'
import { noResults, searchResults } from './fixtures'

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  headers: new Headers(),
  cookies: new Map<string, string>(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({
  headers: async () => mocks.headers,
  cookies: async () => ({
    get: (name: string) =>
      mocks.cookies.has(name) ? { name, value: mocks.cookies.get(name) } : undefined,
  }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/search/',
}))
vi.mock('@/lib/api/server', () => ({ apiFetch: mocks.apiFetch }))
vi.mock('@/lib/api/client', () => ({ bffFetch: () => new Promise(() => {}) }))
vi.mock('@/config/env', async () => {
  const { parseServerEnv } = await import('@/config/env-schema')
  const env = parseServerEnv({
    FIREFLY_API_URL: 'https://api.shop.ir/',
    SITE_URL: 'https://shop.ir/',
    FIREFLY_API_KEY: 'k',
  })
  return { getServerEnv: () => env }
})
vi.mock('@/config/store-config', async () => {
  const pure = await import('@/config/resolve-store-config')
  const { parseServerEnv } = await import('@/config/env-schema')
  const config = () =>
    pure.resolveStoreConfig(
      parseServerEnv({
        FIREFLY_API_URL: 'https://api.shop.ir/',
        SITE_URL: 'https://shop.ir/',
        FIREFLY_API_KEY: 'k',
      }),
    )
  return { ...pure, getStoreConfig: config }
})
vi.mock('@/features/settings/api', () => ({
  getTranslations: async () => ({}),
  getSiteSettings: async () => ({ name: 'فایرفلای' }),
  getCategoryTree: async () => sampleTree(),
  getFeatureStatus: async () => ({ blog: { key: 'blog', name: '', enabled: true, reason: null } }),
}))
vi.mock('@/features/catalog/api', () => ({
  getProductSettings: async () => ({ show_out_of_stock_label: true }),
}))

stubBrowserApis()

const TOKEN = makeJwt({ exp: 4_102_444_800 })

function props(search: Record<string, string | string[]> = {}) {
  return { searchParams: Promise.resolve(search) }
}

async function show(search: Record<string, string | string[]> = {}) {
  const { wrapper } = clientProviders()
  const tree = await SearchPage(props(search))
  return render(await resolveServerTree(tree as ReactNode), { wrapper })
}

function found(data = searchResults()) {
  mocks.apiFetch.mockResolvedValue({ data, msg: '', status: 200, headers: new Headers() })
}

beforeEach(() => {
  mocks.apiFetch.mockReset()
  mocks.headers = new Headers({ 'x-real-ip': '5.6.7.8' })
  mocks.cookies = new Map()
})

describe('the search page without a term', () => {
  it.each([
    ['missing', {}],
    ['empty', { q: '' }],
    ['blank', { q: '   ' }],
    ['invisible only', { q: '\u{200C}\u{202B}' }],
  ])('never calls the search API when q is %s, and shows the tips', async (_, search) => {
    await show(search)
    expect(mocks.apiFetch).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { level: 1, name: 'جستجو' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'چه چیزی را جستجو می\u{200C}کنید؟' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'راهنمای جستجو' })).toBeInTheDocument()
    // The page's own search form, named apart from the header's.
    expect(screen.getByRole('search', { name: 'جستجو در فروشگاه' })).toHaveAttribute(
      'action',
      '/search/',
    )
  })

  it('has a «جستجو» title, noindex, and no API call for its metadata', async () => {
    const meta = await generateMetadata(props({ q: ' ' }))
    expect(meta.title).toBe('جستجو')
    expect(meta.robots).toEqual({ index: false, follow: true })
    expect(mocks.apiFetch).not.toHaveBeenCalled()
    const bare = await generateMetadata(props({}))
    expect(bare.alternates).toEqual({ canonical: '/search/' })
  })
})

describe('the search page with a term', () => {
  it('searches uncached, with the visitor IP and session, and heads the page with the normalised term', async () => {
    found(searchResults({ query: 'گوشی' }))
    mocks.cookies.set('ff_at', TOKEN)
    await show({ q: ' \u{06AF}\u{0648}\u{0634}\u{064A} ' })
    expect(mocks.apiFetch).toHaveBeenCalledTimes(1)
    const [path, options] = mocks.apiFetch.mock.calls[0]!
    expect(path).toBe('search/')
    expect(options).toEqual({
      query: { q: ' \u{06AF}\u{0648}\u{0634}\u{064A} ' },
      forwardedFor: '5.6.7.8',
      token: TOKEN,
    })
    expect(options).not.toHaveProperty('revalidate')
    expect(
      screen.getByRole('heading', { level: 1, name: 'نتایج جستجو برای «گوشی»' }),
    ).toBeInTheDocument()
  })

  it('sends no session that is not a token', async () => {
    found()
    mocks.cookies.set('ff_at', 'not a token')
    await show({ q: 'گوشی' })
    expect(mocks.apiFetch.mock.calls[0]![1].token).toBeNull()
  })

  it('titles the page «جستجو: …» with the term the API searched, noindex', async () => {
    found(searchResults({ query: 'گوشی' }))
    const meta = await generateMetadata(props({ q: 'گوشي' }))
    expect(meta.title).toBe('جستجو: گوشی')
    expect(meta.robots).toEqual({ index: false, follow: true })
    // `/search/?q=…` is not `/search/`: no canonical pointing there beside the noindex.
    expect(meta).not.toHaveProperty('alternates')
  })

  it('shows the products as a grid with their add buttons, and each other group as a list', async () => {
    found()
    await show({ q: 'گوشی' })
    const products = screen.getByRole('region', { name: /^محصولات/ })
    expect(within(products).getAllByRole('article')).toHaveLength(2)
    // Variable: quick view; simple: one tap to the cart (the shared add slot).
    expect(
      within(products).getByRole('button', { name: 'انتخاب ویژگی\u{200C}ها' }),
    ).toHaveAttribute('aria-haspopup', 'dialog')
    expect(within(products).getByRole('button', { name: 'افزودن به سبد' })).toBeInTheDocument()

    const categories = screen.getByRole('region', { name: /^دسته/ })
    expect(within(categories).getByRole('link', { name: /گوشی موبایل/ })).toHaveAttribute(
      'href',
      '/product-category/digital/mobile-phone/',
    )
    const brands = screen.getByRole('region', { name: /^برندها/ })
    expect(within(brands).getByRole('link', { name: /سامسونگ/ })).toHaveAttribute(
      'href',
      '/brand/samsung/',
    )
    const posts = screen.getByRole('region', { name: /^مطالب/ })
    expect(within(posts).getByRole('link', { name: /بهترین گوشی/ })).toHaveAttribute(
      'href',
      '/blog/best-phones-under-30m/',
    )
    const pages = screen.getByRole('region', { name: /^صفحه/ })
    expect(within(pages).getByRole('link', { name: /راهنمای خرید گوشی/ })).toHaveAttribute(
      'href',
      '/page/phone-guide/',
    )
  })

  it('links «مشاهده\u{0654} همه» of the products to the listing of the group’s query, as the API names it', async () => {
    found()
    await show({ q: 'گوشی' })
    const products = screen.getByRole('region', { name: /^محصولات/ })
    expect(within(products).getByRole('link', { name: /^مشاهده\u{0654} همه/u })).toHaveAttribute(
      'href',
      `/product/list/?search=${encodeURIComponent('گوشی')}&special_first=false`,
    )
    // Every category, brand and page is already shown.
    for (const name of [/^دسته/, /^برندها/, /^صفحه/]) {
      const region = screen.getByRole('region', { name })
      expect(within(region).queryByRole('link', { name: /^مشاهده/ })).toBeNull()
    }
  })

  it('offers no «مشاهده\u{0654} همه» without a listing query', async () => {
    found(
      searchResults({
        products: { count: 20, items: searchResults().products.items, listing_query: null },
      }),
    )
    await show({ q: 'گوشی' })
    const products = screen.getByRole('region', { name: /^محصولات/ })
    expect(within(products).queryByRole('link', { name: /^مشاهده/ })).toBeNull()
  })

  it('leaves out the groups with nothing found', async () => {
    found(searchResults({ blog_posts: { count: 0, items: [], listing_query: null } }))
    await show({ q: 'گوشی' })
    expect(screen.queryByRole('region', { name: /^مطالب/ })).toBeNull()
  })

  it('says when nothing was found, with tips and the main categories', async () => {
    found(noResults('zzqx'))
    await show({ q: 'zzqx' })
    expect(
      screen.getByRole('heading', { name: 'نتیجه\u{200C}ای برای «zzqx» پیدا نشد' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'راهنمای جستجو' })).toBeInTheDocument()
    const categories = screen.getByRole('list', { name: 'دسته\u{200C}بندی\u{200C}های اصلی' })
    expect(within(categories).getByRole('link', { name: 'کالای دیجیتال' })).toHaveAttribute(
      'href',
      '/product-category/digital/',
    )
  })
})

describe('the search page when the API refuses', () => {
  it('explains a term the API cannot search, with its reason', async () => {
    mocks.apiFetch.mockRejectedValue(
      new ApiError({
        status: 400,
        errors: [
          { code: 'min_length', detail: 'عبارت جستجو باید دست\u{200C}کم ۲ نویسه باشد.', attr: 'q' },
        ],
      }),
    )
    await show({ q: 'س' })
    expect(screen.getByRole('heading', { level: 1, name: 'جستجو' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'این عبارت را نمی\u{200C}توان جستجو کرد' }),
    ).toBeInTheDocument()
    expect(screen.getByText('عبارت جستجو باید دست\u{200C}کم ۲ نویسه باشد.')).toBeInTheDocument()
    // The field to try again, named, with the refused term in it.
    const again = screen.getByRole('search', { name: 'جستجوی دوباره' })
    expect(within(again).getByRole('combobox')).toHaveValue('س')
  })

  it.each([
    ['max_length', 'عبارت جستجو بیش از حد بلند است.'],
    ['null_characters_not_allowed', 'عبارت جستجو نویسه\u{200C}ای نامعتبر دارد.'],
    ['some_new_code', 'عبارت دیگری را امتحان کنید.'],
  ])('says why in its own words when the API gives no reason (%s)', async (code, copy) => {
    mocks.apiFetch.mockRejectedValue(
      new ApiError({ status: 400, errors: [{ code, detail: ' ', attr: 'q' }] }),
    )
    await show({ q: 'x'.repeat(201) })
    expect(screen.getByText(copy)).toBeInTheDocument()
  })

  it('asks to try again later after a 429', async () => {
    mocks.apiFetch.mockRejectedValue(
      new ApiError({ status: 429, code: 'throttled', retryAfter: 30 }),
    )
    await show({ q: 'گوشی' })
    expect(
      screen.getByRole('heading', { name: 'لطفاً کمی بعد دوباره تلاش کنید' }),
    ).toBeInTheDocument()
  })

  it('lets other failures reach the error page', async () => {
    mocks.apiFetch.mockRejectedValue(new ApiError({ status: 503, code: 'http_503' }))
    await expect(SearchPage(props({ q: 'گوشی' }))).rejects.toBeInstanceOf(ApiError)
  })

  it('titles a refused search with the term as typed, normalised', async () => {
    mocks.apiFetch.mockRejectedValue(new ApiError({ status: 400, code: 'min_length' }))
    const meta = await generateMetadata(props({ q: ' س ' }))
    expect(meta.title).toBe('جستجو: س')
  })
})
