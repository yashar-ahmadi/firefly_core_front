import { render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DISPLAY_STYLES, displayStyle } from '@/features/display/display-style'
import { SectionRenderer } from '@/features/home/sections/section-renderer'
import type { HomeSection } from '@/lib/api/types/catalog'
import { cardFixture } from '../catalog/card-fixtures'
import { stubBrowserApis } from '../support/dom-stubs'
import { clientProviders } from '../support/providers'
import {
  bannerSection,
  banners,
  categoryFixture,
  categoryGrid,
  postCarousel,
  postFixture,
  productCarousel,
  richText,
  sliderSection,
} from './fixtures'

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('next/link', () => ({
  default: (props: ComponentProps<'a'> & { href: string; prefetch?: unknown }) => {
    const anchorProps: ComponentProps<'a'> & { prefetch?: unknown } = { ...props }
    delete anchorProps.prefetch
    return <a data-next-link="" {...anchorProps} />
  },
}))
vi.mock('@/features/catalog/api', () => ({
  getProductSettings: async () => ({
    paginator_number: 24,
    show_out_of_stock_label: true,
    related_items_display_status: true,
    related_items_number: 8,
  }),
}))
vi.mock('@/features/settings/api', () => ({ getTranslations: async () => ({}) }))
vi.mock('@/config/store-config', async () => {
  const pure = await import('@/config/resolve-store-config')
  const { parseServerEnv } = await import('@/config/env-schema')
  const config = pure.resolveStoreConfig(
    parseServerEnv({
      FIREFLY_API_URL: 'http://localhost:8000',
      SITE_URL: 'https://shop.ir/',
      FIREFLY_API_KEY: 'k',
    }),
  )
  return { ...pure, getStoreConfig: () => config }
})

stubBrowserApis()

const styled = <T extends HomeSection>(section: T, style: string): T => ({ ...section, style })

async function renderSections(sections: HomeSection[]) {
  const { wrapper } = clientProviders()
  return render(await SectionRenderer({ sections }), { wrapper })
}

beforeEach(() => {
  localStorage.clear()
})

describe('displayStyle', () => {
  it('keeps the four known styles and reads anything else as style_1', () => {
    for (const style of DISPLAY_STYLES) expect(displayStyle(style)).toBe(style)
    for (const value of ['style_5', '', 'STYLE_2', null, undefined, 2]) {
      expect(displayStyle(value)).toBe('style_1')
    }
  })
})

describe('home sections in each style', () => {
  it.each(DISPLAY_STYLES)('draws every slide of a slider in %s', async (style) => {
    const items = banners(3)
    const { container } = await renderSections([styled(sliderSection(items), style)])
    for (const item of items)
      expect(screen.getAllByRole('img', { name: item.alt })[0]).toBeDefined()
    expect(container.querySelector('[data-style]')).toHaveAttribute('data-style', style)
  })

  it('offers a thumbnail per slide in style 4, named by the slide’s title', async () => {
    await renderSections([styled(sliderSection(banners(3)), 'style_4')])
    const picker = screen.getByRole('group', { name: 'انتخاب اسلاید' })
    expect(within(picker).getByRole('button', { name: 'بنر 1' })).toBeInTheDocument()
    expect(within(picker).getByRole('button', { name: 'بنر 3' })).toBeInTheDocument()
  })

  it('puts a split slide’s words on its panel with a button (style 3)', async () => {
    await renderSections([styled(sliderSection(banners(1)), 'style_3')])
    const link = screen.getByRole('link', { name: /بنر 1/ })
    expect(within(link).getByText('خرید')).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/product/item-1/')
  })

  it.each(DISPLAY_STYLES)('draws every banner of a group in %s', async (style) => {
    const items = banners(5)
    await renderSections([styled(bannerSection(items), style)])
    for (const item of items) {
      expect(screen.getAllByRole('img', { name: item.alt }).length).toBeGreaterThan(0)
    }
  })

  it('lays the first five banners out as a mosaic in style 4', async () => {
    const { container } = await renderSections([styled(bannerSection(banners(5)), 'style_4')])
    expect(container.querySelector('[data-mosaic="5"]')).not.toBeNull()
  })

  it('writes a banner card’s words under its picture (style 3)', async () => {
    await renderSections([styled(bannerSection(banners(2)), 'style_3')])
    const link = screen.getByRole('link', { name: /بنر 1/ })
    expect(within(link).getByText('خرید')).toBeInTheDocument()
  })

  it.each(DISPLAY_STYLES)('lists every product of a carousel in %s', async (style) => {
    const products = [cardFixture(), cardFixture({ id: 2, slug: 'two', name: 'کالای دوم' })]
    await renderSections([styled(productCarousel({ products }), style)])
    expect(screen.getAllByRole('link', { name: /کالای دوم/ }).length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { level: 2, name: 'پیشنهاد ویژه\u{0654} فایرفلای' }))
  })

  it('draws style 3 as the «پیشنهاد شگفت‌انگیز» band, its see-all a white button', async () => {
    const { container } = await renderSections([
      styled(
        productCarousel({
          listing_query: { has_timed_discount: 'true', in_stock: 'true', special_first: 'false' },
        }),
        'style_3',
      ),
    ])
    expect(container.querySelector('[data-band]')).not.toBeNull()
    expect(screen.getByRole('link', { name: 'مشاهده\u{0654} همه' })).toHaveAttribute(
      'href',
      '/product/list/?has_timed_discount=true&in_stock=true&special_first=false',
    )
  })

  it('ranks the products of style 4 in an ordered list', async () => {
    const products = [cardFixture(), cardFixture({ id: 2, slug: 'two', name: 'کالای دوم' })]
    await renderSections([styled(productCarousel({ products }), 'style_4')])
    const list = screen.getByRole('list', { name: 'پیشنهاد ویژه\u{0654} فایرفلای' })
    expect(list.tagName).toBe('OL')
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
  })

  it.each(DISPLAY_STYLES)('links every category by its path in %s', async (style) => {
    const categories = [
      categoryFixture(),
      categoryFixture({ id: 2, name: 'لپ تاپ', path: 'digital/laptop' }),
    ]
    await renderSections([styled(categoryGrid(categories), style)])
    expect(screen.getByRole('link', { name: /لپ تاپ/ })).toHaveAttribute(
      'href',
      '/product-category/digital/laptop/',
    )
  })

  it.each(DISPLAY_STYLES)('links every post in %s', async (style) => {
    const posts = [postFixture(), postFixture({ id: 2, slug: 'second', name: 'پست دوم' })]
    await renderSections([styled(postCarousel(posts), style)])
    expect(screen.getByRole('link', { name: /پست دوم/ })).toHaveAttribute('href', '/blog/second/')
  })

  it('features the first post and lists at most four after it (style 3)', async () => {
    const posts = Array.from({ length: 7 }, (_, index) =>
      postFixture({ id: index + 1, slug: `p${index + 1}`, name: `پست ${index + 1}` }),
    )
    await renderSections([styled(postCarousel(posts), 'style_3')])
    expect(screen.getByRole('heading', { level: 3, name: 'پست 1' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /پست 5/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /پست 6/ })).toBeNull()
  })

  it.each(DISPLAY_STYLES)('renders a rich text in %s', async (style) => {
    const { container } = await renderSections([styled(richText('<p>متن سالم</p>'), style)])
    expect(screen.getByText('متن سالم')).toBeInTheDocument()
    expect(container.querySelector(`[data-style="${style}"]`)).not.toBeNull()
  })

  it('draws an unknown style as style 1', async () => {
    const { container } = await renderSections([styled(richText('<p>متن</p>'), 'style_9')])
    expect(container.querySelector('[data-style="style_1"]')).not.toBeNull()
  })
})
