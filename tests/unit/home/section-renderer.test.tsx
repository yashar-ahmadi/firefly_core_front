import { render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SectionRenderer } from '@/features/home/sections/section-renderer'
import { seeAllHref } from '@/features/home/see-all'
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
  slideFixture,
  sliderSection,
  unknownSection,
} from './fixtures'

const SEE_ALL = 'مشاهده\u{0654} همه'

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

async function renderSections(sections: HomeSection[]) {
  const { wrapper } = clientProviders()
  return render(await SectionRenderer({ sections }), { wrapper })
}

beforeEach(() => {
  localStorage.clear()
})

describe('SectionRenderer', () => {
  it('renders nothing for a section type it does not know', async () => {
    const { container } = await renderSections([unknownSection()])
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the known sections around an unknown one, in operator order', async () => {
    await renderSections([
      productCarousel({ title: 'اول' }),
      unknownSection(),
      productCarousel({ id: 3, title: 'دوم' }),
    ])
    const headings = screen.getAllByRole('heading', { level: 2 })
    expect(headings.map((heading) => heading.textContent)).toEqual(['اول', 'دوم'])
  })

  it('renders nothing for empty sections or items without an image', async () => {
    const { container } = await renderSections([
      sliderSection([]),
      bannerSection([slideFixture({ image: '', mobile_image: null })]),
      productCarousel({ products: [] }),
      categoryGrid([]),
      postCarousel([]),
      richText('<p>&nbsp;</p>'),
      richText('<script>alert(1)</script>', 2),
    ])
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a title and subtitle only when they are not empty', async () => {
    await renderSections([productCarousel({ title: '', subtitle: '' })])
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
    expect(screen.getAllByRole('article')).toHaveLength(1)
  })
})

describe('see all', () => {
  it('links a product carousel to the listing of its query when the operator gave no link', async () => {
    const section = productCarousel({
      listing_query: { sort: 'sale', in_stock: 'true', special_first: 'false' },
      link: null,
    })
    await renderSections([section])
    expect(screen.getByRole('link', { name: SEE_ALL })).toHaveAttribute(
      'href',
      '/product/list/?sort=sale&in_stock=true&special_first=false',
    )
    expect(seeAllHref(section)).toBe('/product/list/?sort=sale&in_stock=true&special_first=false')
  })

  it("prefers the operator's link and its title", async () => {
    await renderSections([
      productCarousel({
        listing_query: { brand: 'apple', in_stock: 'true', special_first: 'false' },
        link: { url: '/brand/apple/', title: 'همه\u{0654} محصولات اپل' },
      }),
    ])
    const link = screen.getByRole('link', { name: 'همه\u{0654} محصولات اپل' })
    expect(link).toHaveAttribute('href', '/brand/apple/')
    expect(screen.queryByRole('link', { name: SEE_ALL })).toBeNull()
  })

  it('labels an operator link without a title with the default label and ignores one without a URL', () => {
    const titled = productCarousel({ link: { url: '/brand/apple/', title: '' } })
    expect(seeAllHref(titled)).toBe('/brand/apple/')
    expect(seeAllHref(productCarousel({ link: { url: '', title: 'همه' } }))).toBeNull()
    expect(seeAllHref(productCarousel({ link: null, listing_query: null }))).toBeNull()
    expect(seeAllHref(categoryGrid([categoryFixture()]))).toBeNull()
  })
})

describe('slider and banners', () => {
  it('serves the mobile image through <source media="(max-width: 767px)">', async () => {
    const { container } = await renderSections([sliderSection([slideFixture()])])
    const source = container.querySelector('picture > source')
    expect(source).toHaveAttribute('media', '(max-width: 767px)')
    expect(source?.getAttribute('srcset')).toContain('black-friday-guide.png')
    const image = container.querySelector('picture > img')
    expect(image?.getAttribute('src')).toContain('black-friday-guide-banner.png')
    expect(image).toHaveAttribute('alt', 'بنر کمپین جمعه\u{0654} سیاه فایرفلای')
  })

  it('uses one image everywhere when there is no mobile image', async () => {
    const { container } = await renderSections([
      sliderSection([slideFixture({ mobile_image: null })]),
    ])
    expect(container.querySelector('picture > source')).toBeNull()
    expect(container.querySelector('picture > img')).toBeInTheDocument()
  })

  it('links the whole slide, labels its button with the link title and colours the text', async () => {
    await renderSections([sliderSection([slideFixture()])])
    const link = screen.getByRole('link', { name: /کمپین جمعه/ })
    expect(link).toHaveAttribute('href', '/blog/black-friday-guide/')
    expect(within(link).getByText('راهنمای خرید کمپین')).toBeInTheDocument()
    expect(within(link).getByText('کمپین جمعه\u{0654} سیاه')).toHaveStyle({ color: '#FFFFFF' })
  })

  it('renders a slide without a link as no link at all', async () => {
    await renderSections([sliderSection([slideFixture({ link: null })])])
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('کمپین جمعه\u{0654} سیاه')).toBeInTheDocument()
  })

  it('lays a scrim under the words only: a button alone stays on the bare picture', async () => {
    const { container } = await renderSections([
      bannerSection([
        slideFixture({ id: 1, text_color: '' }),
        slideFixture({ id: 2, title: '', description: '', link: { url: '/x/', title: 'خرید' } }),
        slideFixture({ id: 3, text_color: '#111827' }),
      ]),
    ])
    const [words, buttonOnly, dark] = [...container.querySelectorAll('[data-count] > a')]
    expect(words?.querySelector('[data-scrim="dark"]')?.getAttribute('style')).toContain(
      'linear-gradient',
    )
    expect(buttonOnly?.querySelector('[data-scrim]')).toBeNull()
    expect(within(buttonOnly as HTMLElement).getByText('خرید')).toBeInTheDocument()
    // Dark operator text gets the light scrim.
    expect(dark?.querySelector('[data-scrim="light"]')).toBeInTheDocument()
  })

  it.each([
    [1, '1'],
    [2, '2'],
    [3, '3'],
    [4, '4'],
    [5, 'many'],
    [7, 'many'],
  ])('lays %i banners out by count (data-count=%s)', async (count, layout) => {
    const { container } = await renderSections([bannerSection(banners(count))])
    const grid = container.querySelector('[data-count]')
    expect(grid).toHaveAttribute('data-count', layout)
    expect(grid?.children).toHaveLength(count)
  })

  it('gives only the first image of the first image section a high fetch priority', async () => {
    const { container } = await renderSections([
      richText('<p>به فروشگاه خوش آمدید</p>'),
      productCarousel(),
      sliderSection([slideFixture(), slideFixture({ id: 2, image: 'http://x.test/2.png' })]),
      bannerSection(banners(2)),
    ])
    const eager = container.querySelectorAll('img[loading="eager"]')
    expect(eager).toHaveLength(1)
    expect(eager[0]?.getAttribute('src')).toContain('black-friday-guide-banner.png')
    expect(eager[0]).toHaveAttribute('fetchpriority', 'high')
    expect(container.querySelectorAll('img[fetchpriority="high"]')).toHaveLength(1)
    const others = [...container.querySelectorAll('img')].filter((img) => img !== eager[0])
    expect(others.length).toBeGreaterThan(3)
    for (const img of others) expect(img).toHaveAttribute('loading', 'lazy')
  })

  it('gives the priority to a banner group when it is the first image section', async () => {
    const { container } = await renderSections([
      sliderSection([]),
      bannerSection(banners(3)),
      sliderSection([slideFixture()], 7),
    ])
    const eager = container.querySelectorAll('img[loading="eager"]')
    expect(eager).toHaveLength(1)
    expect(eager[0]?.getAttribute('src')).toContain('/banners/1.png')
  })
})

describe('product carousel', () => {
  it('shows product cards, with a one-tap add button only for simple products', async () => {
    await renderSections([
      productCarousel({
        products: [
          cardFixture({ id: 1, slug: 'variable', name: 'کالای چندگونه' }),
          cardFixture({ id: 2, slug: 'simple', name: 'کالای ساده', type: 'simple' }),
          cardFixture({
            id: 3,
            slug: 'simple-no-variant',
            name: 'کالای بی\u{200C}گونه',
            type: 'simple',
            default_variant_id: null,
          }),
        ],
      }),
    ])
    const [variable, simple, noVariant] = screen.getAllByRole('article')
    expect(within(simple!).getByRole('button', { name: /افزودن به سبد/ })).toBeInTheDocument()
    expect(within(variable!).queryByRole('button', { name: /افزودن به سبد/ })).toBeNull()
    expect(within(noVariant!).queryByRole('button', { name: /افزودن به سبد/ })).toBeNull()
    expect(within(variable!).getByRole('link', { name: 'کالای چندگونه' })).toHaveAttribute(
      'href',
      '/product/variable/',
    )
    // A variable product's «choose options» opens quick view: a button once hydrated, a link
    // to its page underneath (and before hydration).
    const options = within(variable!).getByRole('button', { name: 'انتخاب ویژگی\u{200C}ها' })
    expect(options).toHaveAttribute('href', '/product/variable/')
    expect(options).toHaveAccessibleDescription('کالای چندگونه')
    expect(within(simple!).queryByText('انتخاب ویژگی\u{200C}ها')).toBeNull()
    expect(within(noVariant!).queryByText('انتخاب ویژگی\u{200C}ها')).toBeNull()
  })

  it('names the carousel after the section', async () => {
    await renderSections([productCarousel()])
    expect(screen.getByRole('region', { name: 'پیشنهاد ویژه\u{0654} فایرفلای' })).toHaveAttribute(
      'aria-roledescription',
      'carousel',
    )
  })
})

describe('category grid, posts and rich text', () => {
  it('links each category to its full path, without product counts', async () => {
    await renderSections([
      categoryGrid([categoryFixture(), categoryFixture({ id: 3, name: 'لپ تاپ', path: 'laptop' })]),
    ])
    expect(screen.getByRole('link', { name: 'گوشی موبایل' })).toHaveAttribute(
      'href',
      '/product-category/digital/mobile-phone/',
    )
    expect(screen.getByRole('link', { name: 'لپ تاپ' })).toHaveAttribute(
      'href',
      '/product-category/laptop/',
    )
    expect(screen.queryByText('۷')).toBeNull()
  })

  it('shows compact post cards linking to the post with a Jalali date', async () => {
    await renderSections([postCarousel([postFixture()])])
    const link = screen.getByRole('link', { name: /بهترین گوشی/ })
    expect(link).toHaveAttribute('href', '/blog/best-phones-under-30m/')
    expect(screen.getByText('۱۰ شهریور ۱۴۰۵')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'همه\u{0654} مطالب' })).toHaveAttribute(
      'href',
      '/blog/',
    )
  })

  it('renders rich text sanitised inside .rich-content', async () => {
    const { container } = await renderSections([
      richText('<p onclick="x()">فایرفلای <b>اصل</b></p><script>alert(1)</script>'),
    ])
    const body = container.querySelector('.rich-content')
    expect(body?.innerHTML).toBe('<p>فایرفلای <b>اصل</b></p>')
    expect(screen.getByRole('heading', { level: 2, name: 'چرا فایرفلای؟' })).toBeInTheDocument()
  })
})
