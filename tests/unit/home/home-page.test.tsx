import { act, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ShopHomePage, { generateMetadata } from '@/app/(shop)/page'
import { useRecentlyViewed } from '@/features/recently-viewed/store'
import type { HomePage } from '@/lib/api/types/catalog'
import type { SiteSettings } from '@/lib/api/types/settings'
import { cardFixture } from '../catalog/card-fixtures'
import { stubBrowserApis } from '../support/dom-stubs'
import { clientProviders } from '../support/providers'
import { resolveServerTree } from '../support/server-tree'
import { productCarousel } from './fixtures'

const mocks = vi.hoisted(() => ({
  settings: null as SiteSettings | null,
  home: null as HomePage | Error | null,
  recentlyViewed: true,
}))

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/features/settings/api', () => ({
  getSiteSettings: async () => mocks.settings,
  getTranslations: async () => ({}),
}))
vi.mock('@/features/catalog/api', () => ({
  getHomePage: async () => {
    if (mocks.home instanceof Error) throw mocks.home
    return mocks.home
  },
  getProductSettings: async () => ({
    paginator_number: 24,
    show_out_of_stock_label: true,
    related_items_display_status: true,
    related_items_number: 8,
  }),
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
        STORE_PRESET: 'carpet',
        FEATURE_RECENTLY_VIEWED: mocks.recentlyViewed ? 'true' : 'false',
      }),
    )
  return { ...pure, getStoreConfig: config }
})

stubBrowserApis()

function homePage(overrides: Partial<HomePage> = {}): HomePage {
  return {
    page_title: 'فرش مهر | فرش دستباف',
    page_description: 'فرش دستباف اصل',
    page_keywords: '',
    canonical_link: null,
    meta_tags: [],
    sections: [productCarousel()],
    ...overrides,
  }
}

async function renderPage() {
  const { wrapper } = clientProviders()
  return render(await resolveServerTree((await ShopHomePage()) as ReactNode), { wrapper })
}

beforeEach(() => {
  mocks.settings = null
  mocks.home = homePage()
  mocks.recentlyViewed = true
  localStorage.clear()
  useRecentlyViewed.setState({ items: [] })
})

function viewed() {
  const { id, slug, image } = cardFixture()
  const items = [{ id, slug, image, name: 'کالای دیده\u{200C}شده' }]
  localStorage.setItem('ff-recent', JSON.stringify({ state: { items }, version: 0 }))
  useRecentlyViewed.setState({ items })
}

describe('home page', () => {
  it('is headed (for assistive tech) with the shop name from the settings', async () => {
    mocks.settings = { name: 'فرش مهر', slogan: null } as SiteSettings
    await renderPage()
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('فرش مهر')
    expect(heading).toHaveClass('sr-only')
  })

  it('falls back to the preset label without settings', async () => {
    await renderPage()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('فرش')
  })

  it('renders the homepage sections in order', async () => {
    mocks.home = homePage({
      sections: [productCarousel({ title: 'پرفروش\u{200C}ها' }), productCarousel({ id: 2 })],
    })
    await renderPage()
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'پرفروش\u{200C}ها',
      'پیشنهاد ویژه\u{0654} فایرفلای',
    ])
  })

  it('shows the recently viewed products after the sections', async () => {
    viewed()
    await renderPage()
    expect(await screen.findByRole('heading', { name: 'بازدیدهای اخیر' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'کالای دیده\u{200C}شده' })).toBeInTheDocument()
  })

  it('leaves recently viewed out when the feature is off', async () => {
    mocks.recentlyViewed = false
    viewed()
    await renderPage()
    await act(async () => {})
    expect(screen.queryByRole('heading', { name: 'بازدیدهای اخیر' })).toBeNull()
  })

  it('throws when the homepage cannot be loaded, so the error page answers', async () => {
    mocks.home = new Error('API down')
    await expect(ShopHomePage()).rejects.toThrow('API down')
    await expect(generateMetadata()).rejects.toThrow('API down')
  })

  it("writes the operator's Open Graph tags with property=, in order, hoisted into <head>", async () => {
    mocks.home = homePage({
      meta_tags: [
        { field: 'og:image', value: 'https://api.shop.ir/og-1.png' },
        { field: 'google-site-verification', value: 'abc' },
        { field: 'og:image', value: 'https://api.shop.ir/og-2.png' },
      ],
    })
    const { container } = await renderPage()
    const images = [...document.head.querySelectorAll('meta[property="og:image"]')]
    expect(images.map((meta) => meta.getAttribute('content'))).toEqual([
      'https://api.shop.ir/og-1.png',
      'https://api.shop.ir/og-2.png',
    ])
    expect(container.querySelector('meta')).toBeNull()
    // A name= row goes through the metadata, never as a property tag.
    expect(document.head.querySelector('meta[property="google-site-verification"]')).toBeNull()
  })

  it('builds the metadata from the homepage SEO fields and the shop name', async () => {
    mocks.settings = { name: 'فرش مهر', slogan: 'فرش دستباف' } as SiteSettings
    mocks.home = homePage({ page_title: '' })
    const meta = await generateMetadata()
    expect(meta.title).toEqual({ absolute: 'فرش مهر | فرش دستباف' })
    expect(meta.description).toBe('فرش دستباف اصل')
    expect(meta.alternates).toEqual({ canonical: '/' })
  })
})
