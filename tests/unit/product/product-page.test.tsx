import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProductPage, { generateMetadata } from '@/app/(shop)/product/[slug]/page'
import { useRecentlyViewed } from '@/features/recently-viewed/store'
import { FeatureProvider } from '@/features/settings/feature-context'
import { ApiError } from '@/lib/api/errors'
import { stubBrowserApis } from '../support/dom-stubs'
import { clientProviders } from '../support/providers'
import { resolveServerTree } from '../support/server-tree'
import { comment, commentPage } from './comment-fixtures'
import { s25Product } from './fixtures'
import { resetRouter, router } from './router'

const mocks = vi.hoisted(() => ({
  getProductDetail: vi.fn(),
  getProductSettings: vi.fn(),
  getFirstComments: vi.fn(),
  providerProps: [] as unknown[],
  recentlyViewed: 'true',
}))

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', async () => ({
  ...(await import('./router')).routerMock,
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: vi.fn() }))
vi.mock('@/features/catalog/api', () => ({
  getProductDetail: mocks.getProductDetail,
  getProductSettings: mocks.getProductSettings,
  getFirstComments: mocks.getFirstComments,
}))
// The `product` message slot is its own test's (product-slot.test.tsx): none here.
vi.mock('@/features/content/dynamic/api', () => ({ getDynamicContent: async () => null }))
vi.mock('@/features/settings/api', () => ({
  getTranslations: async () => ({}),
  getSiteSettings: async () => ({ name: 'فایرفلای', phone: '+982191000000' }),
}))
vi.mock('@/features/product/components/product-provider', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/features/product/components/product-provider')>()
  return {
    ...actual,
    ProductProvider: (props: Parameters<typeof actual.ProductProvider>[0]) => {
      mocks.providerProps.push(props)
      return <actual.ProductProvider {...props} />
    },
  }
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
        FEATURE_RECENTLY_VIEWED: mocks.recentlyViewed,
      }),
    )
  return { ...pure, getStoreConfig: config }
})

stubBrowserApis()

const SLUG = 'samsung-galaxy-s25-ultra'
const NOT_FOUND_TITLE = { absolute: 'صفحه پیدا نشد | فایرفلای' }
const SETTINGS = {
  paginator_number: 24,
  show_out_of_stock_label: true,
  related_items_display_status: true,
  related_items_number: 8,
}
const RELATED = 'محصولات مرتبط'

function props(slug = SLUG) {
  return { params: Promise.resolve({ slug }) }
}

/** The page at `slug`; the query is `router.search` (what useSearchParams reads). */
async function renderPage(slug = SLUG) {
  const { wrapper: Base } = clientProviders()
  const tree = await resolveServerTree((await ProductPage(props(slug))) as ReactNode)
  return render(
    <Base>
      <FeatureProvider initial={{}}>{tree}</FeatureProvider>
    </Base>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  resetRouter()
  mocks.providerProps.length = 0
  mocks.recentlyViewed = 'true'
  localStorage.clear()
  useRecentlyViewed.setState({ items: [] })
  mocks.getProductDetail.mockResolvedValue(s25Product())
  mocks.getProductSettings.mockResolvedValue(SETTINGS)
  mocks.getFirstComments.mockImplementation(async (_slug: string, type: string) =>
    commentPage([
      type === 'comment'
        ? comment()
        : comment({ id: 20001, comment_type: 'question', title: null, review: 'باتری چند روز؟' }),
    ]),
  )
})

describe('the product route: status codes (R9)', () => {
  it('is not found for an unknown product, with a not-found title', async () => {
    mocks.getProductDetail.mockResolvedValue(null)
    await expect(ProductPage(props('does-not-exist'))).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mocks.getProductDetail).toHaveBeenCalledWith('does-not-exist')
    // Nothing streams before the status is settled: no review read for a missing product.
    expect(mocks.getFirstComments).not.toHaveBeenCalled()
    expect((await generateMetadata(props('does-not-exist'))).title).toEqual(NOT_FOUND_TITLE)
  })

  it('lets other failures reach the error boundary', async () => {
    mocks.getProductDetail.mockRejectedValue(new ApiError({ status: 503 }))
    await expect(ProductPage(props())).rejects.toBeInstanceOf(ApiError)
  })
})

describe('the product page', () => {
  it('shows the name, the trail through its categories and the buy box', async () => {
    await renderPage()
    expect(mocks.getProductDetail).toHaveBeenCalledWith(SLUG)
    expect(
      screen.getByRole('heading', { level: 1, name: 'گوشی موبایل سامسونگ گلکسی S25 اولترا' }),
    ).toBeInTheDocument()
    const trail = screen.getByRole('navigation', { name: 'مسیر صفحه' })
    expect(within(trail).getByRole('link', { name: 'کالای دیجیتال' })).toHaveAttribute(
      'href',
      '/product-category/digital/',
    )
    expect(within(trail).getByRole('link', { name: 'گوشی موبایل' })).toHaveAttribute(
      'href',
      '/product-category/digital/mobile-phone/',
    )
    expect(within(trail).getByText('گوشی موبایل سامسونگ گلکسی S25 اولترا')).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: 'سامسونگ' })).toHaveAttribute('href', '/brand/samsung/')
    expect(screen.getByText('شناسه محصول:').parentElement).toHaveTextContent('شناسه محصول: ۰۱۰۰۰۱')
    expect(screen.getAllByRole('button', { name: 'افزودن به سبد خرید' }).length).toBeGreaterThan(0)
    expect(screen.queryByText('این صفحه هنوز منتشر نشده است')).toBeNull()
  })

  it('keeps the buy box in view beside the summary from lg', async () => {
    await renderPage()
    const box = screen.getByRole('region', { name: 'خرید' })
    expect(box).toHaveClass('lg:sticky')
    expect(box.parentElement).toHaveClass('lg:grid')
  })

  it('links the rating to the reviews', async () => {
    await renderPage()
    expect(screen.getByRole('link', { name: /۳ دیدگاه/ })).toHaveAttribute('href', '#reviews')
  })

  it('says «بدون امتیاز» without a rating, and never counts zero reviews', async () => {
    mocks.getProductDetail.mockResolvedValue(
      s25Product({ rating: 0, rating_count: 0, comment_count: 0 }),
    )
    await renderPage()
    const link = screen.getByRole('link', { name: 'بدون امتیاز' })
    expect(link).toHaveAttribute('href', '#reviews')
    expect(link).not.toHaveTextContent('دیدگاه')
  })

  it('keeps the variant axes out of the key specs (the picker shows them)', async () => {
    await renderPage()
    const specs = screen.getByRole('list', { name: 'ویژگی\u{200C}های اصلی' })
    expect(within(specs).queryByText(/^رنگ/)).toBeNull()
    expect(
      within(specs).getByText('نمایشگر ۶.۸ اینچی QHD+ با نرخ نوسازی ۱۲۰ هرتز'),
    ).toBeInTheDocument()
  })

  it('opens on the variant a shared link names (read from the URL by the provider)', async () => {
    router.search = 'variant=10003'
    await renderPage()
    const colours = screen.getByRole('radiogroup', { name: 'رنگ' })
    expect(within(colours).getByRole('radio', { name: /^طلایی/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    // Not from the page: a payload restored by Back/Forward was built for another URL.
    expect(mocks.providerProps.at(-1)).not.toHaveProperty('initialVariantId')
  })

  it('hands the browser only what the buying leaves need', async () => {
    await renderPage()
    const { product } = mocks.providerProps.at(-1) as { product: Record<string, unknown> }
    expect(product).toHaveProperty('variants')
    for (const heavy of ['content', 'related_products', 'specifications', 'structured_data']) {
      expect(product).not.toHaveProperty(heavy)
    }
  })

  it('embeds the Product and BreadcrumbList JSON-LD on the shop origin', async () => {
    const { container } = await renderPage()
    const blocks = [...container.querySelectorAll('script[type="application/ld+json"]')].map(
      (script) => JSON.parse(script.textContent ?? '{}') as Record<string, unknown>,
    )
    expect(blocks.map((block) => block['@type'])).toEqual(['Product', 'BreadcrumbList'])
    expect(blocks[0]).toMatchObject({
      offers: { url: 'https://shop.ir/product/samsung-galaxy-s25-ultra/', lowPrice: '785000000' },
    })
    expect(String(blocks[0]?.image)).toMatch(/^https:\/\/shop\.ir\/media\//)
    const items = (blocks[1] as { itemListElement: { item: string }[] }).itemListElement
    expect(items.map((item) => item.item)).toEqual([
      'https://shop.ir/',
      'https://shop.ir/product-category/digital/',
      'https://shop.ir/product-category/digital/mobile-phone/',
    ])
    // Rial prices live only in the JSON-LD, never in the text.
    const visible = container.cloneNode(true) as HTMLElement
    for (const script of visible.querySelectorAll('script')) script.remove()
    expect(visible.textContent).not.toMatch(/۷۸۵٬۰۰۰٬۰۰۰|785000000/)
    expect(visible.textContent).toContain('۷۸٬۵۰۰٬۰۰۰')
  })

  it('warns staff that a draft is not published', async () => {
    mocks.getProductDetail.mockResolvedValue(s25Product({ is_unpublished: true }))
    await renderPage()
    const banner = screen.getByText('این صفحه هنوز منتشر نشده است')
    expect(banner).toHaveAttribute('role', 'status')
  })
})

describe('the product page below the fold', () => {
  it('has the section bar and the sections in order: intro, specs, reviews, questions', async () => {
    const { container } = await renderPage()
    const bar = screen.getByRole('navigation', { name: 'بخش\u{200C}های صفحه\u{0654} محصول' })
    expect(
      within(bar)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['#intro', '#specs', '#reviews', '#questions'])
    const ids = [...container.querySelectorAll('section[id]')].map((section) => section.id)
    expect(ids.filter((id) => ['intro', 'specs', 'reviews', 'questions'].includes(id))).toEqual([
      'intro',
      'specs',
      'reviews',
      'questions',
    ])
    expect(screen.getByRole('region', { name: 'مشخصات' })).toHaveTextContent('مشکی، نقره ای، طلایی')
    expect(screen.getByRole('region', { name: 'دیدگاه\u{200C}ها' })).toContainElement(
      screen.getByRole('list', { name: 'امتیازها' }),
    )
    expect(screen.getByRole('button', { name: 'ثبت دیدگاه' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ثبت پرسش' })).toBeInTheDocument()
  })

  it("then the shop's FAQ, the related products and no bundle for a plain product", async () => {
    await renderPage()
    expect(screen.getByRole('heading', { name: 'پرسش\u{200C}های متداول' })).toBeInTheDocument()
    const rail = screen.getByRole('region', { name: RELATED })
    expect(within(rail).getAllByRole('article')).toHaveLength(3)
    expect(screen.queryByRole('region', { name: 'محتویات بسته' })).toBeNull()
  })

  it('honours the related-products settings: the switch and the number', async () => {
    mocks.getProductSettings.mockResolvedValue({ ...SETTINGS, related_items_number: 2 })
    const { unmount } = await renderPage()
    expect(
      within(screen.getByRole('region', { name: RELATED })).getAllByRole('article'),
    ).toHaveLength(2)
    unmount()
    mocks.getProductSettings.mockResolvedValue({ ...SETTINGS, related_items_display_status: false })
    await renderPage()
    expect(screen.queryByRole('region', { name: RELATED })).toBeNull()
  })

  it("lists a bundle's contents", async () => {
    mocks.getProductDetail.mockResolvedValue(
      s25Product({
        is_collection: true,
        bundle_items: [
          {
            variant: 10042,
            product_name: 'پاوربانک انکر ۲۰۰۰۰ میلی آمپرساعت',
            variant_name: null,
            quantity: 1,
            image: 'https://api.shop.ir/media/a.jpg',
          },
          {
            variant: 10044,
            product_name: 'کابل شارژ USB-C بیسوس ۱۰۰ وات',
            variant_name: 'رنگ: مشکی',
            quantity: 2,
            image: 'https://api.shop.ir/media/b.jpg',
          },
        ],
      }),
    )
    await renderPage()
    const bundle = screen.getByRole('region', { name: 'محتویات بسته' })
    const items = within(bundle).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[1]).toHaveTextContent('کابل شارژ USB-C بیسوس ۱۰۰ وات')
    expect(items[1]).toHaveTextContent('رنگ: مشکی')
    expect(items[1]).toHaveTextContent('۲ عدد')
  })

  it('renders page 1 of the reviews and of the questions on the server (spec §8.13)', async () => {
    await renderPage()
    expect(mocks.getProductDetail).toHaveBeenCalledTimes(1)
    // Started early by the page, then read by each list (one request: React cache()).
    expect(new Set(mocks.getFirstComments.mock.calls.map((call) => call.join(' ')))).toEqual(
      new Set([`${SLUG} comment`, `${SLUG} question`]),
    )
    const reviews = screen.getByRole('list', { name: 'دیدگاه\u{200C}ها' })
    expect(within(reviews).getByText(comment().review!)).toBeInTheDocument()
    const questions = screen.getByRole('list', { name: 'پرسش\u{200C}ها' })
    expect(within(questions).getByText('باتری چند روز؟')).toBeInTheDocument()
    expect(screen.queryByLabelText('در حال بارگذاری دیدگاه\u{200C}ها')).toBeNull()
  })

  it('reads nothing for a section with a count of zero', async () => {
    mocks.getProductDetail.mockResolvedValue(s25Product({ question_count: 0 }))
    await renderPage()
    expect(mocks.getFirstComments).not.toHaveBeenCalledWith(SLUG, 'question')
    expect(mocks.getFirstComments).toHaveBeenCalledWith(SLUG, 'comment')
    expect(screen.getByText('هنوز پرسشی ثبت نشده است.')).toBeInTheDocument()
  })

  it('leaves the list to the browser when the server read fails', async () => {
    mocks.getFirstComments.mockResolvedValue(null)
    await renderPage()
    expect(screen.getByLabelText('در حال بارگذاری دیدگاه\u{200C}ها')).toBeInTheDocument()
  })
})

describe('recently viewed', () => {
  it('records the visit on this device', async () => {
    await renderPage()
    expect(useRecentlyViewed.getState().items.map((item) => item.slug)).toEqual([SLUG])
  })

  it('records nothing while the shop has the feature off', async () => {
    mocks.recentlyViewed = 'false'
    await renderPage()
    expect(useRecentlyViewed.getState().items).toEqual([])
  })
})

describe('product metadata', () => {
  it('uses the backend SEO fields, the product image and the shop name', async () => {
    const product = s25Product()
    const meta = await generateMetadata(props())
    expect(meta.title).toEqual({ absolute: product.page_title })
    expect(meta.description).toBe(product.page_description)
    expect(meta.keywords).toBe(product.page_keywords)
    expect(meta.alternates).toEqual({ canonical: '/product/samsung-galaxy-s25-ultra/' })
    expect(meta).not.toHaveProperty('robots')
    expect(meta.openGraph).toMatchObject({ images: [product.image], siteName: 'فایرفلای' })
    expect(meta.twitter).toMatchObject({ card: 'summary_large_image', images: [product.image] })
  })

  it('falls back to the product text, not the shop slogan, without a page description', async () => {
    mocks.getProductDetail.mockResolvedValue(
      s25Product({ page_description: '', description: 'گوشی پرچمدار سامسونگ با قلم.' }),
    )
    const meta = await generateMetadata(props())
    expect(meta.description).toBe('گوشی پرچمدار سامسونگ با قلم.')
  })

  it('is noindex, nofollow for a draft seen in a staff preview', async () => {
    mocks.getProductDetail.mockResolvedValue(s25Product({ is_unpublished: true }))
    expect((await generateMetadata(props())).robots).toEqual({ index: false, follow: false })
  })
})
