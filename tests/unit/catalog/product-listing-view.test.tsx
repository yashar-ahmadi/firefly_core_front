import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { minWidth, stubBrowserApis } from '../support/dom-stubs'
import { cardFixture } from './card-fixtures'
import { MOBILE_FILTERS } from './filter-fixtures'
import {
  listingTree,
  listOf,
  PROPS,
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
const bff = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('@/features/catalog/api', () => api)
vi.mock('@/features/settings/api', () => settings)
vi.mock('@/lib/api/client', () => ({ bffFetch: bff.fetch }))
vi.mock('next/navigation', async () => (await import('./navigation-harness')).navigationMock)

// A desktop: the sidebar's filters render from lg only (sidebar-filters.tsx).
stubBrowserApis(minWidth(64))

beforeEach(() => {
  vi.clearAllMocks()
  resetNavigation()
  settings.getCategoryTree.mockResolvedValue([])
  api.getListPage.mockResolvedValue(null)
  api.getFilters.mockResolvedValue(MOBILE_FILTERS)
  api.getProductSettings.mockResolvedValue(SETTINGS)
  api.getProductList.mockResolvedValue(listOf([cardFixture()]))
})

const sidebar = () => screen.getByRole('complementary', { name: 'فیلترها' })

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
    const grid = screen.getByRole('list', { name: 'صفحهٔ ۱' })
    expect(within(grid).getAllByRole('article')).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'صفحه بعدی' })).toHaveAttribute(
      'href',
      '/product-category/digital/mobile-phone/?brand=apple&page=2',
    )
  })

  it('names the server grid after the page it shows', async () => {
    api.getProductList.mockResolvedValue(
      listOf([cardFixture()], { count: 60, total_pages: 3, current_page: 3 }),
    )
    await renderListing({ searchParams: { page: '3' } }, 'page=3')
    expect(screen.getByRole('list', { name: 'صفحهٔ ۳' })).toBeInTheDocument()
  })

  it('offers no category facet on a category page', async () => {
    await renderListing({})
    expect(within(sidebar()).queryByRole('radiogroup', { name: 'دسته‌بندی' })).toBeNull()
    for (const group of ['برند', 'رنگ', 'محدوده قیمت', 'وضعیت کالا']) {
      expect(within(sidebar()).getByRole('group', { name: group })).toBeInTheDocument()
    }
  })

  it('offers no brand facet on a brand page', async () => {
    api.getFilters.mockResolvedValue(STORE_FILTERS)
    await renderListing({ context: { brand: 'samsung' }, basePath: '/brand/samsung/' })
    expect(within(sidebar()).queryByRole('group', { name: 'برند' })).toBeNull()
    expect(within(sidebar()).getByRole('radiogroup', { name: 'دسته‌بندی' })).toBeInTheDocument()
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

  it('remounts «نمایش بیشتر» when the query changes, dropping the appended pages', async () => {
    api.getProductList.mockResolvedValue(listOf([cardFixture()], { count: 60, total_pages: 3 }))
    bff.fetch.mockResolvedValue({
      data: listOf([cardFixture({ id: 50, slug: 'p-50', name: 'پنجاهم' })], {
        current_page: 2,
        total_pages: 3,
      }),
      msg: '',
      status: 200,
    })
    const view = await renderListing({ searchParams: { brand: 'apple' } }, 'brand=apple')
    await userEvent.setup().click(screen.getByRole('button', { name: 'نمایش بیشتر' }))
    expect(await screen.findByRole('list', { name: 'صفحهٔ ۲' })).toBeInTheDocument()

    navigation.search = 'brand=samsung'
    view.rerender(<>{await listingTree({ ...PROPS, searchParams: { brand: 'samsung' } })}</>)
    expect(screen.queryByRole('list', { name: 'صفحهٔ ۲' })).toBeNull()
    expect(screen.getByRole('button', { name: 'نمایش بیشتر' })).toBeEnabled()
  })
})
