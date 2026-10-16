import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CategoryPage, { generateMetadata } from '@/app/(shop)/product-category/[...path]/page'
import type { CategoryDetail } from '@/lib/api/types/catalog'
import { stubBrowserApis } from '../support/dom-stubs'
import { clientProviders } from '../support/providers'
import { resolveServerTree } from '../support/server-tree'
import { categoryFixture, digitalFilters } from './route-fixtures'

const mocks = vi.hoisted(() => ({
  getCategory: vi.fn(),
  getFilters: vi.fn(),
  isPastLastPage: vi.fn(),
  listing: null as Record<string, unknown> | null,
}))

class Redirect extends Error {
  constructor(readonly url: string) {
    super('NEXT_REDIRECT')
  }
}

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  permanentRedirect: (url: string) => {
    throw new Redirect(url)
  },
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/features/catalog/api', () => ({
  getCategory: mocks.getCategory,
  getFilters: mocks.getFilters,
  isPastLastPage: mocks.isPastLastPage,
}))
vi.mock('@/features/settings/api', () => ({
  getTranslations: async () => ({}),
  getSiteSettings: async () => ({ name: 'فایرفلای' }),
}))
vi.mock('@/features/catalog/components/listing/product-listing', () => ({
  ProductListing: (props: Record<string, unknown>) => {
    mocks.listing = props
    return <div data-testid="listing" />
  },
}))
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

stubBrowserApis()

const PERSIAN_ROOT = 'دیجیتال'
const PERSIAN_LEAF = 'گوشی'
const persian = () =>
  categoryFixture({ slug: PERSIAN_LEAF, path: `${PERSIAN_ROOT}/${PERSIAN_LEAF}` })

function props(path: string[], search: Record<string, string | string[]> = {}) {
  return { params: Promise.resolve({ path }), searchParams: Promise.resolve(search) }
}

async function failure(rendering: Promise<unknown>): Promise<unknown> {
  try {
    await rendering
  } catch (error) {
    return error
  }
  throw new Error('expected the page to stop rendering')
}

async function renderPage(path: string[], search: Record<string, string> = {}) {
  const { wrapper } = clientProviders()
  const tree = (await CategoryPage(props(path, search))) as ReactNode
  return render(await resolveServerTree(tree), { wrapper })
}

function useCategory(category: CategoryDetail | null) {
  mocks.getCategory.mockResolvedValue(category)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listing = null
  useCategory(categoryFixture())
  mocks.getFilters.mockResolvedValue({ ...digitalFilters(), categories: [] })
  mocks.isPastLastPage.mockResolvedValue(false)
})

describe('the category route', () => {
  it('fetches by the last segment and renders the canonical path', async () => {
    await renderPage(['digital', 'mobile-phone'])
    expect(mocks.getCategory).toHaveBeenCalledWith('mobile-phone')
    expect(screen.getByRole('heading', { level: 1, name: 'گوشی موبایل' })).toBeInTheDocument()
    expect(screen.getByText('خرید انواع گوشی موبایل از فروشگاه فایرفلای.')).toBeInTheDocument()
    expect(mocks.listing).toMatchObject({
      context: { category: 'mobile-phone' },
      basePath: '/product-category/digital/mobile-phone/',
      defaultSort: 'date-desc',
    })
  })

  it('moves a non-canonical path to the category path with a 308, keeping the query', async () => {
    const error = await failure(
      CategoryPage(props(['mobile-phone'], { brand: 'apple', attribute_values: ['1', '2'] })),
    )
    expect(error).toBeInstanceOf(Redirect)
    expect((error as Redirect).url).toBe(
      '/product-category/digital/mobile-phone/?brand=apple&attribute_values=1&attribute_values=2',
    )
  })

  it('round-trips Persian slugs: encoded or decoded, the canonical path renders', async () => {
    useCategory(persian())
    await renderPage([encodeURIComponent(PERSIAN_ROOT), encodeURIComponent(PERSIAN_LEAF)])
    await renderPage([PERSIAN_ROOT, PERSIAN_LEAF])
    expect(mocks.listing).toMatchObject({
      context: { category: PERSIAN_LEAF },
      basePath: `/product-category/${encodeURIComponent(PERSIAN_ROOT)}/${encodeURIComponent(PERSIAN_LEAF)}/`,
    })
  })

  it('redirects a short Persian path to the encoded canonical one', async () => {
    useCategory(persian())
    const error = await failure(CategoryPage(props([encodeURIComponent(PERSIAN_LEAF)])))
    expect((error as Redirect).url).toBe(
      `/product-category/${encodeURIComponent(PERSIAN_ROOT)}/${encodeURIComponent(PERSIAN_LEAF)}/`,
    )
  })

  it('is not found for an unknown category or a segment that cannot be a slug', async () => {
    useCategory(null)
    expect(await failure(CategoryPage(props(['nope'])))).toMatchObject({
      message: 'NEXT_NOT_FOUND',
    })
    mocks.getCategory.mockClear()
    expect(await failure(CategoryPage(props(['digital', '%E0%A4%A'])))).toMatchObject({
      message: 'NEXT_NOT_FOUND',
    })
    expect(mocks.getCategory).not.toHaveBeenCalled()
  })

  it('lets other failures reach the error boundary', async () => {
    mocks.getCategory.mockRejectedValue(new Error('API down'))
    expect(await failure(CategoryPage(props(['digital'])))).toMatchObject({ message: 'API down' })
  })
})

describe('the category page', () => {
  it('links the subcategories that have products, by their full path', async () => {
    useCategory(
      categoryFixture({
        name: 'کالای دیجیتال',
        slug: 'digital',
        path: 'digital',
        breadcrumb: [
          { id: 10001, name: 'کالای دیجیتال', slug: 'digital', path: 'digital', parent_id: null },
        ],
      }),
    )
    mocks.getFilters.mockResolvedValue(digitalFilters())
    await renderPage(['digital'])
    expect(mocks.getFilters).toHaveBeenCalledWith({ category: 'digital' })
    const chips = screen.getByRole('navigation', { name: 'زیردسته‌ها' })
    expect(
      within(chips)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/product-category/digital/mobile-phone/', '/product-category/digital/laptop/'])
    expect(within(chips).getByRole('link', { name: /گوشی موبایل/ })).toHaveTextContent('۷')
  })

  it('shows breadcrumbs and the breadcrumb JSON-LD on the shop origin', async () => {
    const { container } = await renderPage(['digital', 'mobile-phone'])
    const trail = screen.getByRole('navigation', { name: 'مسیر صفحه' })
    expect(within(trail).getByRole('link', { name: 'کالای دیجیتال' })).toHaveAttribute(
      'href',
      '/product-category/digital/',
    )
    const script = container.querySelector('script[type="application/ld+json"]')
    const data = JSON.parse(script?.textContent ?? '{}') as {
      itemListElement: { item: string }[]
    }
    expect(data.itemListElement.map((item) => item.item)).toEqual([
      'https://shop.ir/',
      'https://shop.ir/product-category/digital/',
      'https://shop.ir/product-category/digital/mobile-phone/',
    ])
  })

  it('shows the content, consider-before-buying and the FAQ below the listing', async () => {
    useCategory(
      categoryFixture({
        content: '<h2>راهنمای خرید</h2><p>متن راهنما</p>',
        consider_before_buying: {
          title: 'پیش از خرید گوشی',
          text: '<p>به باتری توجه کنید.</p>',
          button: 'مطالعهٔ نکات',
        },
        question_answers: [{ question: 'گارانتی دارد؟', answer: 'بله، ۱۸ ماه.' }],
      }),
    )
    await renderPage(['digital', 'mobile-phone'])
    const listing = screen.getByTestId('listing')
    const guide = screen.getByRole('heading', { name: 'راهنمای خرید' })
    const consider = screen.getByRole('heading', { name: 'پیش از خرید گوشی' })
    const faq = screen.getByRole('heading', { level: 2, name: 'پرسش‌های متداول' })
    for (const below of [guide, consider, faq]) {
      expect(listing.compareDocumentPosition(below) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    expect(screen.getByRole('button', { name: 'مطالعهٔ نکات' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'گارانتی دارد؟' })).toBeInTheDocument()
  })
})

describe('category metadata', () => {
  it('uses the backend SEO fields with an absolute title', async () => {
    useCategory(categoryFixture({ page_description: 'خرید گوشی' }))
    const meta = await generateMetadata(props(['digital', 'mobile-phone']))
    expect(meta.title).toEqual({ absolute: 'گوشی موبایل | فروشگاه فایرفلای' })
    expect(meta.description).toBe('خرید گوشی')
    expect(meta.alternates).toEqual({ canonical: '/product-category/digital/mobile-phone/' })
    expect(meta).not.toHaveProperty('robots')
    // The API's grey placeholder is no picture to share.
    expect(meta.openGraph).not.toHaveProperty('images')
  })

  it('is noindex for a filtered URL and self-canonical with the page number on page 2', async () => {
    const filtered = await generateMetadata(props(['digital', 'mobile-phone'], { brand: 'apple' }))
    expect(filtered.robots).toEqual({ index: false, follow: true })
    const second = await generateMetadata(props(['digital', 'mobile-phone'], { page: '2' }))
    expect(second).not.toHaveProperty('robots')
    expect(second.alternates).toEqual({
      canonical: '/product-category/digital/mobile-phone/?page=2',
    })
  })

  it('gives a not-found title to a page past the last (the listing answers 404)', async () => {
    mocks.isPastLastPage.mockResolvedValue(true)
    const meta = await generateMetadata(props(['digital', 'mobile-phone'], { page: '999' }))
    expect(meta.title).toEqual({ absolute: 'صفحه پیدا نشد | فایرفلای' })
    // The listing's own query: route context, default sort and the URL's page.
    expect(mocks.isPastLastPage).toHaveBeenCalledWith({
      category: 'mobile-phone',
      sort: 'date-desc',
      page: 999,
    })
  })

  it('gives a not-found title when the category does not exist', async () => {
    useCategory(null)
    const meta = await generateMetadata(props(['nope']))
    expect(meta.title).toEqual({ absolute: 'صفحه پیدا نشد | فایرفلای' })
  })
})
