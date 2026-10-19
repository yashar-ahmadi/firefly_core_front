import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BrandsPage, { generateMetadata as brandsMetadata } from '@/app/(shop)/brand/page'
import BrandPage, { generateMetadata as brandMetadata } from '@/app/(shop)/brand/[slug]/page'
import ListingPage, { generateMetadata as listingMetadata } from '@/app/(shop)/product/list/page'
import ListPage, {
  generateMetadata as listPageMetadata,
} from '@/app/(shop)/product/list/[slug]/page'
import type { BrandCard } from '@/lib/api/types/catalog'
import { stubBrowserApis } from '../support/dom-stubs'
import { clientProviders } from '../support/providers'
import { resolveServerTree } from '../support/server-tree'
import { brandFixture, listPageFixture } from './route-fixtures'

const mocks = vi.hoisted(() => ({
  getBrand: vi.fn(),
  getBrands: vi.fn(),
  getListPage: vi.fn(),
  isPastLastPage: vi.fn(),
  listing: null as Record<string, unknown> | null,
}))

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/features/catalog/api', () => ({
  getBrand: mocks.getBrand,
  getBrands: mocks.getBrands,
  getListPage: mocks.getListPage,
  isPastLastPage: mocks.isPastLastPage,
}))
vi.mock('@/features/settings/api', () => ({
  getTranslations: async () => ({}),
  getSiteSettings: async () => ({ name: 'فایرفلای' }),
}))
vi.mock('@/features/catalog/components/listing/product-listing', () => ({
  ProductListing: (props: Record<string, unknown>) => {
    mocks.listing = props
    return <div data-testid="listing">{props.title as ReactNode}</div>
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

type Search = Record<string, string>

const NOT_FOUND_TITLE = { absolute: 'صفحه پیدا نشد | فایرفلای' }

function slugProps(slug: string, search: Search = {}) {
  return { params: Promise.resolve({ slug }), searchParams: Promise.resolve(search) }
}

function searchProps(search: Search = {}) {
  return { searchParams: Promise.resolve(search) }
}

async function show(tree: Promise<unknown> | unknown) {
  const { wrapper } = clientProviders()
  return render(await resolveServerTree((await tree) as ReactNode), { wrapper })
}

function brandCard(id: number, name: string, slug: string, product_count = 1): BrandCard {
  return {
    id,
    name,
    slug,
    image: 'http://localhost:8000/static/defaults/default.png',
    product_count,
    created: '',
    updated: '',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listing = null
  mocks.getBrand.mockResolvedValue(brandFixture())
  mocks.getListPage.mockResolvedValue(listPageFixture())
  mocks.getBrands.mockResolvedValue([])
  mocks.isPastLastPage.mockResolvedValue(false)
})

describe('the brand page', () => {
  it('shows the logo hero, then the listing with the brand as context', async () => {
    const { container } = await show(BrandPage(slugProps('samsung')))
    expect(mocks.getBrand).toHaveBeenCalledWith('samsung')
    expect(screen.getByRole('heading', { level: 1, name: 'سامسونگ' })).toBeInTheDocument()
    expect(screen.getByText('محصولات اصل برند سامسونگ با گارانتی معتبر.')).toBeInTheDocument()
    expect(mocks.listing).toMatchObject({
      context: { brand: 'samsung' },
      basePath: '/brand/samsung/',
    })
    const trail = screen.getByRole('navigation', { name: 'مسیر صفحه' })
    expect(within(trail).getByRole('link', { name: 'برندها' })).toHaveAttribute('href', '/brand/')
    expect(container.querySelector('script[type="application/ld+json"]')).not.toBeNull()
  })

  it('is not found for an unknown brand, with a not-found title', async () => {
    mocks.getBrand.mockResolvedValue(null)
    await expect(BrandPage(slugProps('nope'))).rejects.toThrow('NEXT_NOT_FOUND')
    expect((await brandMetadata(slugProps('nope'))).title).toEqual(NOT_FOUND_TITLE)
  })

  it('builds its BreadcrumbList from the visible trail: home, brands, the brand', async () => {
    const { container } = await show(BrandPage(slugProps('samsung')))
    const trail = screen.getByRole('navigation', { name: 'مسیر صفحه' })
    expect(within(trail).getByRole('link', { name: 'خانه' })).toHaveAttribute('href', '/')
    expect(within(trail).getByRole('link', { name: 'برندها' })).toHaveAttribute('href', '/brand/')
    expect(within(trail).getByText('سامسونگ')).toHaveAttribute('aria-current', 'page')
    const script = container.querySelector('script[type="application/ld+json"]')
    const list = JSON.parse(script?.textContent ?? '{}') as {
      itemListElement: { position: number; name: string; item: string }[]
    }
    expect(list.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'خانه', item: 'https://shop.ir/' },
      { '@type': 'ListItem', position: 2, name: 'برندها', item: 'https://shop.ir/brand/' },
      { '@type': 'ListItem', position: 3, name: 'سامسونگ', item: 'https://shop.ir/brand/samsung/' },
    ])
  })

  it('shares its 70×70 logo on a small Twitter card, with the shop name', async () => {
    const logo = 'https://api.shop.ir/media/brands/samsung.jpg'
    mocks.getBrand.mockResolvedValue(brandFixture({ image: logo }))
    const meta = await brandMetadata(slugProps('samsung'))
    expect(meta.twitter).toMatchObject({ card: 'summary', images: [logo] })
    expect(meta.openGraph).toMatchObject({ images: [logo], siteName: 'فایرفلای' })
  })

  it('takes its title and description from the backend', async () => {
    const meta = await brandMetadata(slugProps('samsung', { page: '2' }))
    // An indexable later page says which page it is.
    expect(meta.title).toEqual({ absolute: 'خرید محصولات سامسونگ - صفحهٔ ۲' })
    expect(meta.description).toBe('لیست کامل محصولات سامسونگ با قیمت روز و ارسال سریع.')
    expect(meta.alternates).toEqual({ canonical: '/brand/samsung/?page=2' })
    expect(meta).not.toHaveProperty('robots')
  })
})

describe('a page past the last', () => {
  it('is titled as not found on the brand, list and generic listings', async () => {
    mocks.isPastLastPage.mockResolvedValue(true)
    expect((await brandMetadata(slugProps('samsung', { page: '9' }))).title).toEqual(
      NOT_FOUND_TITLE,
    )
    expect(mocks.isPastLastPage).toHaveBeenLastCalledWith({ brand: ['samsung'], page: 9 })
    expect((await listPageMetadata(slugProps('flagship-phones', { page: '9' }))).title).toEqual(
      NOT_FOUND_TITLE,
    )
    expect(mocks.isPastLastPage).toHaveBeenLastCalledWith({
      list: 'flagship-phones',
      sort: 'sale',
      page: 9,
    })
    expect((await listingMetadata(searchProps({ has_discount: 'true', page: '9' }))).title).toEqual(
      NOT_FOUND_TITLE,
    )
    expect(mocks.isPastLastPage).toHaveBeenLastCalledWith({ has_discount: true, page: 9 })
  })
})

describe('the brands index', () => {
  it('lists every brand in Persian alphabetical order, linked to its page', async () => {
    mocks.getBrands.mockResolvedValue([
      brandCard(1, 'هایسنس', 'hisense', 3),
      brandCard(2, 'پاناسونیک', 'panasonic', 1),
      brandCard(3, 'اپل', 'apple', 6),
    ])
    await show(BrandsPage())
    expect(screen.getByRole('heading', { level: 1, name: 'برندها' })).toBeInTheDocument()
    const links = within(screen.getByRole('list', { name: 'برندها' })).getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/brand/apple/',
      '/brand/panasonic/',
      '/brand/hisense/',
    ])
    expect(links[0]).toHaveTextContent('اپل')
    expect(links[0]).toHaveTextContent('۶ کالا')
  })

  it('its trail (home › «برندها») is its BreadcrumbList JSON-LD, on the shop’s origin', async () => {
    mocks.getBrands.mockResolvedValue([brandCard(3, 'اپل', 'apple', 6)])
    const { container } = await show(BrandsPage())
    const blocks = [...container.querySelectorAll('script[type="application/ld+json"]')].map(
      (script) => JSON.parse(script.textContent ?? ''),
    )
    expect(blocks).toEqual([
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'خانه', item: 'https://shop.ir/' },
          { '@type': 'ListItem', position: 2, name: 'برندها', item: 'https://shop.ir/brand/' },
        ],
      },
    ])
  })

  it('is titled «برندها» and indexable', async () => {
    const meta = await brandsMetadata()
    expect(meta.title).toBe('برندها')
    expect(meta.alternates).toEqual({ canonical: '/brand/' })
    expect(meta).not.toHaveProperty('robots')
    expect(meta.openGraph).toMatchObject({ siteName: 'فایرفلای' })
  })
})

describe('the curated list page', () => {
  it('shows its name and description, then the listing with the list and its sort', async () => {
    await show(ListPage(slugProps('flagship-phones')))
    expect(screen.getByRole('heading', { level: 1, name: 'گوشی های پرچمدار' })).toBeInTheDocument()
    expect(screen.getByText('گوشی های پرچمدار فروشگاه فایرفلای.')).toBeInTheDocument()
    expect(mocks.listing).toMatchObject({
      context: { list: 'flagship-phones' },
      basePath: '/product/list/flagship-phones/',
      defaultSort: 'sale',
    })
    const trail = screen.getByRole('navigation', { name: 'مسیر صفحه' })
    expect(within(trail).getByRole('link', { name: 'گوشی موبایل' })).toHaveAttribute(
      'href',
      '/product-category/digital/mobile-phone/',
    )
  })

  it('shows the FAQ when the list has one', async () => {
    mocks.getListPage.mockResolvedValue(
      listPageFixture({ question_answers: [{ question: 'ارسال رایگان است؟', answer: 'بله.' }] }),
    )
    await show(ListPage(slugProps('flagship-phones')))
    expect(screen.getByRole('heading', { level: 3, name: 'ارسال رایگان است؟' })).toBeInTheDocument()
  })

  it('is not found for an unknown list, with a not-found title', async () => {
    mocks.getListPage.mockResolvedValue(null)
    await expect(ListPage(slugProps('nope'))).rejects.toThrow('NEXT_NOT_FOUND')
    expect((await listPageMetadata(slugProps('nope'))).title).toEqual(NOT_FOUND_TITLE)
  })

  it('is noindex when filtered', async () => {
    const meta = await listPageMetadata(slugProps('flagship-phones', { sort: 'price-asc' }))
    expect(meta.title).toEqual({ absolute: 'گوشی های پرچمدار' })
    expect(meta.robots).toEqual({ index: false, follow: true })
    // No canonical to the clean page: with noindex that is a mixed signal.
    expect(meta).not.toHaveProperty('alternates')
    expect(meta.openGraph).not.toHaveProperty('url')
    expect(meta.openGraph).toMatchObject({ siteName: 'فایرفلای' })
  })
})

describe('the generic listing', () => {
  it('builds its title from the query and lists the whole store', async () => {
    await show(ListingPage(searchProps({ has_discount: 'true' })))
    expect(screen.getByRole('heading', { level: 1, name: 'تخفیف‌ها' })).toBeInTheDocument()
    expect(mocks.listing).toMatchObject({ context: {}, basePath: '/product/list/' })
    expect(mocks.getListPage).not.toHaveBeenCalled()
  })

  it("uses a URL list's name when it exists", async () => {
    await show(ListingPage(searchProps({ list: 'flagship-phones', sort: 'sale' })))
    expect(mocks.getListPage).toHaveBeenCalledWith('flagship-phones')
    expect(screen.getByRole('heading', { level: 1, name: 'گوشی های پرچمدار' })).toBeInTheDocument()
    mocks.getListPage.mockResolvedValue(null)
    const meta = await listingMetadata(searchProps({ list: 'nope', sort: 'sale' }))
    expect(meta.title).toBe('پرفروش‌ترین‌ها')
  })

  it('is always noindex, follow; filtered, it has no canonical', async () => {
    const meta = await listingMetadata(searchProps({ has_discount: 'true', page: '2' }))
    expect(meta.title).toBe('تخفیف‌ها')
    expect(meta.robots).toEqual({ index: false, follow: true })
    expect(meta).not.toHaveProperty('alternates')
    expect(meta.openGraph).toMatchObject({ siteName: 'فایرفلای' })
  })

  it('keeps the bare path as its own canonical', async () => {
    const meta = await listingMetadata(searchProps({}))
    expect(meta.robots).toEqual({ index: false, follow: true })
    expect(meta.alternates).toEqual({ canonical: '/product/list/' })
  })
})
