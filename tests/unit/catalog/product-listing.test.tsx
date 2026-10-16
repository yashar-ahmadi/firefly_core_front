import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ProductListing,
  type ProductListingProps,
} from '@/features/catalog/components/listing/product-listing'
import { ApiError } from '@/lib/api/errors'
import type { ProductCard } from '@/lib/api/types/catalog'
import type { CategoryNode } from '@/lib/api/types/settings'
import type { Paginated } from '@/lib/api/types/common'
import { stubBrowserApis } from '../support/dom-stubs'
import { clientProviders } from '../support/providers'
import { resolveServerTree } from '../support/server-tree'
import { cardFixture } from './card-fixtures'
import { LIST_CATEGORIES, MOBILE_FILTERS, STORE_BRANDS } from './filter-fixtures'

const api = vi.hoisted(() => ({
  getProductList: vi.fn(),
  getFilters: vi.fn(),
  getProductSettings: vi.fn(),
}))
const nav = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  search: '',
}))

vi.mock('@/features/catalog/api', () => api)
const settings = vi.hoisted(() => ({ getCategoryTree: vi.fn() }))
vi.mock('@/features/settings/api', () => settings)
vi.mock('next/navigation', () => ({
  notFound: nav.notFound,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
}))

stubBrowserApis()

const SETTINGS = {
  paginator_number: 24,
  show_out_of_stock_label: true,
  related_items_display_status: true,
  related_items_number: 8,
}

function listOf(products: ProductCard[], extra: Partial<Paginated<ProductCard>> = {}) {
  return {
    count: products.length,
    total_pages: 1,
    current_page: 1,
    page_size: 24,
    next: null,
    previous: null,
    results: products,
    ...extra,
  }
}

const PROPS: ProductListingProps = {
  context: { category: 'mobile-phone' },
  searchParams: Promise.resolve({}),
  basePath: '/product-category/digital/mobile-phone/',
}

async function renderListing(props: Partial<ProductListingProps>, search = '') {
  nav.search = search
  const tree = await resolveServerTree(await ProductListing({ ...PROPS, ...props }))
  const { wrapper } = clientProviders()
  return render(<>{tree}</>, { wrapper })
}

/** A slice of the published category tree (`getCategoryTree()`). */
function node(slug: string, name: string, children: CategoryNode[] = []): CategoryNode {
  return {
    id: slug.length,
    name,
    slug,
    path: slug,
    parent_id: null,
    short_description: null,
    image: '',
    icon: '',
    show_in_homepage: false,
    default_sorting: null,
    product_count: 0,
    created: '',
    updated: '',
    children,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  settings.getCategoryTree.mockResolvedValue([
    node('digital', 'کالای دیجیتال', [node('mobile-phone', 'گوشی موبایل')]),
  ])
  api.getFilters.mockResolvedValue(MOBILE_FILTERS)
  api.getProductSettings.mockResolvedValue(SETTINGS)
  api.getProductList.mockResolvedValue(listOf([cardFixture()]))
})

describe('ProductListing data', () => {
  it('loads the list (route context and default sort applied) and the filters in parallel', async () => {
    let resolveList: (value: unknown) => void = () => {}
    api.getProductList.mockReturnValue(new Promise((resolve) => (resolveList = resolve)))
    const rendering = ProductListing({
      ...PROPS,
      searchParams: Promise.resolve({ category: 'laptop', brand: 'apple', page: '2', x: 'y' }),
      defaultSort: 'sale',
    })
    await vi.waitFor(() =>
      expect(api.getFilters).toHaveBeenCalledWith({ category: 'mobile-phone' }),
    )
    // The route's category wins over the URL's: one filters call, for the route.
    expect(api.getFilters).toHaveBeenCalledOnce()
    expect(api.getProductList).toHaveBeenCalledWith({
      category: 'mobile-phone',
      brand: ['apple'],
      page: 2,
      sort: 'sale',
    })
    resolveList(listOf([cardFixture()], { count: 30, total_pages: 2, current_page: 2 }))
    await expect(rendering).resolves.toBeTruthy()
  })

  it('keeps the URL sort over the default sort', async () => {
    await ProductListing({ ...PROPS, searchParams: { sort: 'price-asc' }, defaultSort: 'sale' })
    expect(api.getProductList).toHaveBeenCalledWith({ category: 'mobile-phone', sort: 'price-asc' })
  })

  it('calls notFound() when the API answers 404 for a page past the last', async () => {
    api.getProductList.mockRejectedValue(new ApiError({ status: 404, code: 'not_found' }))
    await expect(
      ProductListing({ ...PROPS, searchParams: Promise.resolve({ page: '999' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
    expect(nav.notFound).toHaveBeenCalledOnce()
  })

  it('throws any other failure to the error boundary, a proxy 404 page included', async () => {
    for (const error of [ApiError.nonJson(404), new ApiError({ status: 500 })]) {
      api.getProductList.mockRejectedValueOnce(error)
      await expect(ProductListing(PROPS)).rejects.toBe(error)
    }
    api.getFilters.mockRejectedValueOnce(new ApiError({ status: 503 }))
    await expect(ProductListing(PROPS)).rejects.toMatchObject({ status: 503 })
    expect(nav.notFound).not.toHaveBeenCalled()
  })
})

describe('ProductListing facets for a category chosen in the URL', () => {
  /** The store-wide metadata: root categories, every brand, no attributes. */
  const STORE_FILTERS = {
    ...MOBILE_FILTERS,
    categories: LIST_CATEGORIES,
    brands: STORE_BRANDS,
    attributes: [],
  }
  const GENERIC: Partial<ProductListingProps> = {
    context: {},
    basePath: '/product/list/',
    searchParams: { category: 'mobile-phone' },
  }

  beforeEach(() => {
    api.getFilters.mockImplementation(async (ctx: { category?: string }) =>
      ctx.category === 'mobile-phone' ? MOBILE_FILTERS : STORE_FILTERS,
    )
  })

  it("loads that category's filters beside the route's, both in parallel with the list", async () => {
    let resolveList: (value: unknown) => void = () => {}
    api.getProductList.mockReturnValue(new Promise((resolve) => (resolveList = resolve)))
    const rendering = ProductListing({ ...PROPS, ...GENERIC })
    await vi.waitFor(() => expect(api.getFilters).toHaveBeenCalledTimes(2))
    expect(api.getFilters).toHaveBeenCalledWith({ category: 'mobile-phone' })
    expect(api.getFilters).toHaveBeenCalledWith({})
    resolveList(listOf([cardFixture()]))
    await expect(rendering).resolves.toBeTruthy()
  })

  it("keeps the route's other context keys in the category's filters call", async () => {
    await ProductListing({
      ...PROPS,
      context: { brand: 'samsung' },
      basePath: '/brand/samsung/',
      searchParams: { category: 'mobile-phone' },
    })
    expect(api.getFilters).toHaveBeenCalledWith({ brand: 'samsung', category: 'mobile-phone' })
    expect(api.getFilters).toHaveBeenCalledWith({ brand: 'samsung' })
  })

  it("offers the category's attributes and brands, and the route's categories with the choice checked", async () => {
    await renderListing(GENERIC, 'category=mobile-phone')
    const sidebar = screen.getByRole('complementary', { name: 'فیلترها' })
    expect(within(sidebar).getByRole('group', { name: 'رنگ' })).toBeInTheDocument()
    expect(
      within(sidebar).getAllByRole('checkbox', { name: /^(اپل|سامسونگ|شیائومی)$/ }),
    ).toHaveLength(3)
    const categories = within(sidebar).getByRole('radiogroup', { name: 'دسته‌بندی' })
    expect(within(categories).getByRole('radio', { name: /گوشی موبایل/ })).toBeChecked()
    expect(screen.getByRole('button', { name: 'حذف فیلتر گوشی موبایل' })).toBeInTheDocument()
  })

  it("names a URL category outside the route's options from the category tree", async () => {
    api.getFilters.mockImplementation(async (ctx: { category?: string }) =>
      ctx.category === 'mobile-phone'
        ? MOBILE_FILTERS
        : { ...STORE_FILTERS, categories: [{ ...LIST_CATEGORIES[1]!, slug: 'laptop' }] },
    )
    await renderListing(GENERIC, 'category=mobile-phone')
    expect(screen.getByRole('button', { name: 'حذف فیلتر گوشی موبایل' })).toBeInTheDocument()
  })

  it("falls back to the route's filters when the category's are not found", async () => {
    api.getFilters.mockImplementation(async (ctx: { category?: string }) =>
      ctx.category ? null : STORE_FILTERS,
    )
    await renderListing({ ...GENERIC, searchParams: { category: 'unknown' } }, 'category=unknown')
    const sidebar = screen.getByRole('complementary', { name: 'فیلترها' })
    expect(within(sidebar).queryByRole('group', { name: 'رنگ' })).toBeNull()
    expect(within(sidebar).getByRole('radiogroup', { name: 'دسته‌بندی' })).toBeInTheDocument()
    expect(within(sidebar).getByRole('searchbox', { name: 'جستجوی برند' })).toBeInTheDocument()
  })
})

describe('ProductListing view', () => {
  it('shows the count, the sort from sort_options with the default chosen, chips and the grid', async () => {
    api.getProductList.mockResolvedValue(
      listOf([cardFixture(), cardFixture({ id: 2, slug: 'b', name: 'دومی' })], {
        count: 123,
        total_pages: 6,
      }),
    )
    await renderListing(
      { searchParams: { brand: 'apple' }, defaultSort: 'sale', title: <h1>گوشی موبایل</h1> },
      'brand=apple',
    )
    expect(screen.getByRole('heading', { level: 1, name: 'گوشی موبایل' })).toBeInTheDocument()
    expect(screen.getByText('۱۲۳ کالا')).toBeInTheDocument()
    const sort = screen.getByRole('combobox', { name: 'مرتب‌سازی' })
    expect(
      within(sort)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(MOBILE_FILTERS.sort_options.map((option) => option.label))
    expect(sort).toHaveValue('sale')
    expect(screen.getByRole('button', { name: /فیلترها.*۱ فیلتر فعال/ })).toBeInTheDocument()
    const chips = screen.getByRole('list', { name: 'فیلترهای فعال' })
    expect(within(chips).getByRole('button', { name: 'حذف فیلتر اپل' })).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'صفحه بعدی' })).toHaveAttribute(
      'href',
      '/product-category/digital/mobile-phone/?brand=apple&page=2',
    )
  })

  it('offers no brand facet on a brand page and no category facet on a category page', async () => {
    await renderListing({})
    const sidebar = screen.getByRole('complementary', { name: 'فیلترها' })
    expect(within(sidebar).queryByRole('radiogroup', { name: 'دسته‌بندی' })).toBeNull()
    expect(within(sidebar).getByRole('group', { name: 'برند' })).toBeInTheDocument()
    expect(within(sidebar).getByRole('group', { name: 'رنگ' })).toBeInTheDocument()
    expect(within(sidebar).getByRole('group', { name: 'محدوده قیمت' })).toBeInTheDocument()
    expect(within(sidebar).getByRole('group', { name: 'وضعیت کالا' })).toBeInTheDocument()
  })

  it('shows «no products with these filters» with a way out when filters are active', async () => {
    api.getProductList.mockResolvedValue(listOf([]))
    await renderListing({ searchParams: { brand: 'apple' } }, 'brand=apple')
    expect(
      screen.getByRole('heading', { name: 'محصولی با این فیلترها یافت نشد' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'حذف فیلترها' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'صفحه‌بندی' })).toBeNull()
  })

  it('shows a plain empty state when nothing is filtered', async () => {
    api.getProductList.mockResolvedValue(listOf([]))
    await renderListing({})
    expect(screen.getByRole('heading', { name: 'کالایی یافت نشد' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'حذف فیلترها' })).toBeNull()
  })
})
