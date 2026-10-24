import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ListingContext } from '@/features/catalog/listing-params'
import type { ProductListPageDetail } from '@/lib/api/types/catalog'
import { minWidth, stubBrowserApis } from '../support/dom-stubs'
import { cardFixture } from './card-fixtures'
import { LIST_CATEGORIES, MOBILE_FILTERS } from './filter-fixtures'
import {
  categoryNode,
  GENERIC,
  listOf,
  renderListing,
  SETTINGS,
  STORE_FILTERS,
} from './listing-support'
import { navigation, resetNavigation } from './navigation-harness'

const api = vi.hoisted(() => ({
  getProductList: vi.fn(),
  getFilters: vi.fn(),
  getProductSettings: vi.fn(),
  getListPage: vi.fn(),
}))
const settings = vi.hoisted(() => ({ getCategoryTree: vi.fn() }))
vi.mock('@/features/catalog/api', () => api)
vi.mock('@/features/settings/api', () => settings)
vi.mock('next/navigation', async () => (await import('./navigation-harness')).navigationMock)

// A desktop: the sidebar's filters render from lg only (sidebar-filters.tsx).
stubBrowserApis(minWidth(64))

/** `filters/` by context: mobile-phone has attributes, the store and lists do not. */
async function filtersFor(ctx: ListingContext) {
  if (ctx.category === 'mobile-phone') return MOBILE_FILTERS
  if (ctx.category) return null
  if (ctx.list === 'best-selling-digital') return { ...MOBILE_FILTERS, categories: LIST_CATEGORIES }
  if (ctx.list) return null
  return STORE_FILTERS
}

beforeEach(() => {
  vi.clearAllMocks()
  resetNavigation()
  settings.getCategoryTree.mockResolvedValue([
    categoryNode('digital', 'کالای دیجیتال', [categoryNode('mobile-phone', 'گوشی موبایل')]),
  ])
  api.getListPage.mockResolvedValue(null)
  api.getFilters.mockImplementation(filtersFor)
  api.getProductSettings.mockResolvedValue(SETTINGS)
  api.getProductList.mockResolvedValue(listOf([cardFixture()]))
})

const sidebar = () => screen.getByRole('complementary', { name: 'فیلترها' })
const chip = (label: string) => screen.queryByRole('button', { name: `حذف فیلتر ${label}` })

describe('ProductListing with a category chosen in the URL', () => {
  const search = { category: 'mobile-phone' }

  it('offers its attributes and brands, with the route’s categories and the choice checked', async () => {
    await renderListing({ ...GENERIC, searchParams: search }, 'category=mobile-phone')
    expect(within(sidebar()).getByRole('group', { name: 'رنگ' })).toBeInTheDocument()
    const brands = within(sidebar()).getByRole('group', { name: 'برند' })
    expect(within(brands).getAllByRole('checkbox')).toHaveLength(3)
    const categories = within(sidebar()).getByRole('radiogroup', { name: 'دسته‌بندی' })
    expect(within(categories).getByRole('radio', { name: /گوشی موبایل/ })).toBeChecked()
    expect(chip('گوشی موبایل')).toBeInTheDocument()
  })

  it('names a category outside the route’s options from the category tree', async () => {
    api.getFilters.mockImplementation(async (ctx: ListingContext) =>
      ctx.category ? MOBILE_FILTERS : { ...STORE_FILTERS, categories: [LIST_CATEGORIES[1]!] },
    )
    await renderListing({ ...GENERIC, searchParams: search }, 'category=mobile-phone')
    expect(chip('گوشی موبایل')).toBeInTheDocument()
  })

  it('falls back to the route’s filters when the category’s are not found', async () => {
    await renderListing({ ...GENERIC, searchParams: { category: 'gone' } }, 'category=gone')
    expect(within(sidebar()).queryByRole('group', { name: 'رنگ' })).toBeNull()
    expect(within(sidebar()).getByRole('searchbox', { name: 'جستجوی برند' })).toBeInTheDocument()
  })

  it('drops the attribute values and prices of the old category when switching', async () => {
    const url = 'brand=apple&category=laptop&attribute_values=10001&min_price=2000000'
    await renderListing(
      { ...GENERIC, searchParams: Object.fromEntries(new URLSearchParams(url)) },
      url,
    )
    await userEvent.setup().click(within(sidebar()).getByRole('radio', { name: /گوشی موبایل/ }))
    expect(navigation.replace).toHaveBeenCalledWith(
      '/product/list/?brand=apple&category=mobile-phone',
      {
        scroll: false,
      },
    )
  })
})

describe('ProductListing with a list named in the URL', () => {
  it('filters by it: the list’s facets and a chip named after the list, counted and removable', async () => {
    api.getListPage.mockResolvedValue({ name: 'پرفروش‌های دیجیتال' } as ProductListPageDetail)
    await renderListing(
      { ...GENERIC, searchParams: { list: 'best-selling-digital' } },
      'list=best-selling-digital',
    )
    expect(within(sidebar()).getByRole('group', { name: 'رنگ' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /فیلترها.*۱ فیلتر فعال/ })).toBeInTheDocument()
    await userEvent.setup().click(chip('پرفروش‌های دیجیتال')!)
    expect(navigation.replace).toHaveBeenCalledWith('/product/list/', { scroll: false })
  })

  it('falls back to «فهرست منتخب» and the store’s facets for an unknown list', async () => {
    await renderListing({ ...GENERIC, searchParams: { list: 'gone' } }, 'list=gone')
    expect(chip('فهرست منتخب')).toBeInTheDocument()
    expect(within(sidebar()).getByRole('searchbox', { name: 'جستجوی برند' })).toBeInTheDocument()
  })

  it('is cleared with «حذف همه»', async () => {
    await renderListing(
      { ...GENERIC, searchParams: { list: 'gone', sort: 'sale' } },
      'list=gone&sort=sale',
    )
    const chips = screen.getByRole('list', { name: 'فیلترهای فعال' })
    await userEvent.setup().click(within(chips).getByRole('button', { name: 'حذف همه' }))
    expect(navigation.replace).toHaveBeenCalledWith('/product/list/?sort=sale', { scroll: false })
  })
})
