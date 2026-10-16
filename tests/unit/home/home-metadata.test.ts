import { describe, expect, it } from 'vitest'
import { buildHomeMetadata } from '@/features/home/home-metadata'
import { propertyMetaTags } from '@/features/seo/page-metadata'
import type { HomePage } from '@/lib/api/types/catalog'

const SHOP = { name: 'فایرفلای', slogan: 'فروشگاه اینترنتی کالای اصل' }

function home(overrides: Partial<HomePage> = {}): HomePage {
  return {
    page_title: 'فایرفلای | فروشگاه اینترنتی کالای اصل',
    page_description: 'خرید آنلاین گوشی موبایل و لوازم خانگی با ضمانت اصالت کالا.',
    page_keywords: 'فروشگاه اینترنتی، خرید آنلاین',
    canonical_link: null,
    meta_tags: [],
    sections: [],
    ...overrides,
  }
}

/** Every key, at any depth, that is set to `undefined` (it would wipe the layout's value). */
function undefinedKeys(value: unknown, path = ''): string[] {
  if (typeof value !== 'object' || value === null) return []
  return Object.entries(value).flatMap(([key, child]) =>
    child === undefined ? [`${path}${key}`] : undefinedKeys(child, `${path}${key}.`),
  )
}

describe('buildHomeMetadata', () => {
  it('uses the homepage SEO fields, the title as is (it already names the shop)', () => {
    const meta = buildHomeMetadata(home(), SHOP)
    expect(meta.title).toEqual({ absolute: 'فایرفلای | فروشگاه اینترنتی کالای اصل' })
    expect(meta.description).toBe('خرید آنلاین گوشی موبایل و لوازم خانگی با ضمانت اصالت کالا.')
    expect(meta.keywords).toBe('فروشگاه اینترنتی، خرید آنلاین')
    expect(meta.alternates).toEqual({ canonical: '/' })
    expect(meta.openGraph).toEqual({
      type: 'website',
      url: '/',
      siteName: 'فایرفلای',
      locale: 'fa_IR',
      title: 'فایرفلای | فروشگاه اینترنتی کالای اصل',
      description: 'خرید آنلاین گوشی موبایل و لوازم خانگی با ضمانت اصالت کالا.',
    })
    expect(meta.twitter).toEqual({
      card: 'summary',
      title: 'فایرفلای | فروشگاه اینترنتی کالای اصل',
      description: 'خرید آنلاین گوشی موبایل و لوازم خانگی با ضمانت اصالت کالا.',
    })
    expect(undefinedKeys(meta)).toEqual([])
  })

  it('falls back to the name and slogan, like the layout, and leaves empty fields out', () => {
    const meta = buildHomeMetadata(
      home({ page_title: ' ', page_description: '', page_keywords: '' }),
      SHOP,
    )
    expect(meta.title).toEqual({ absolute: 'فایرفلای | فروشگاه اینترنتی کالای اصل' })
    // The layout's description (the slogan) stays in force; the social cards repeat it.
    expect(meta).not.toHaveProperty('description')
    expect(meta).not.toHaveProperty('keywords')
    expect(meta.openGraph).toMatchObject({ description: 'فروشگاه اینترنتی کالای اصل' })
    expect(meta.twitter).toMatchObject({ description: 'فروشگاه اینترنتی کالای اصل' })
    expect(undefinedKeys(meta)).toEqual([])
  })

  it('is titled with the name alone when there is no slogan either', () => {
    const meta = buildHomeMetadata(home({ page_title: '', page_description: '' }), {
      name: 'فرش مهر',
      slogan: null,
    })
    expect(meta.title).toEqual({ absolute: 'فرش مهر' })
    expect(meta.openGraph).not.toHaveProperty('description')
    expect(meta.twitter).not.toHaveProperty('description')
    expect(undefinedKeys(meta)).toEqual([])
  })

  it("uses the operator's canonical link", () => {
    const meta = buildHomeMetadata(home({ canonical_link: 'https://shop.ir/' }), SHOP)
    expect(meta.alternates).toEqual({ canonical: 'https://shop.ir/' })
    expect(meta.openGraph).toMatchObject({ url: 'https://shop.ir/' })
  })

  it('writes name meta tags through `other`, keeping repeats in order', () => {
    const meta = buildHomeMetadata(
      home({
        meta_tags: [
          { field: 'og:image', value: 'https://api.shop.ir/media/og.png' },
          { field: 'google-site-verification', value: 'abc' },
          { field: 'google-site-verification', value: 'def' },
          { field: 'twitter:card', value: 'summary_large_image' },
        ],
      }),
      SHOP,
    )
    expect(meta.other).toEqual({
      'google-site-verification': ['abc', 'def'],
      'twitter:card': ['summary_large_image'],
    })
    // The operator's card wins over ours.
    expect(meta.twitter).not.toHaveProperty('card')
  })

  it('writes description and keywords once: an operator row of that name wins', () => {
    const meta = buildHomeMetadata(
      home({
        meta_tags: [
          { field: 'Description', value: 'توضیح اپراتور' },
          { field: 'keywords', value: 'کلید اپراتور' },
          { field: 'description', value: 'دومی' },
          { field: 'author', value: 'فایرفلای' },
        ],
      }),
      SHOP,
    )
    expect(meta.description).toBe('توضیح اپراتور')
    expect(meta.keywords).toBe('کلید اپراتور')
    expect(meta.other).toEqual({ author: ['فایرفلای'] })
    expect(meta.openGraph).toMatchObject({ description: 'توضیح اپراتور' })
    expect(meta.twitter).toMatchObject({ description: 'توضیح اپراتور' })
    expect(undefinedKeys(meta)).toEqual([])
  })

  it('takes an operator description even when the SEO field is empty', () => {
    const meta = buildHomeMetadata(
      home({ page_description: '', meta_tags: [{ field: 'description', value: 'از ردیف' }] }),
      SHOP,
    )
    expect(meta.description).toBe('از ردیف')
    expect(meta).not.toHaveProperty('other')
  })

  it("leaves out its own Open Graph values the operator's tags replace", () => {
    const meta = buildHomeMetadata(
      home({
        meta_tags: [
          { field: 'og:type', value: 'store' },
          { field: 'OG:Title', value: 'جشنواره' },
          { field: 'twitter:title', value: 'جشنواره' },
        ],
      }),
      SHOP,
    )
    expect(meta.openGraph).not.toHaveProperty('type')
    expect(meta.openGraph).not.toHaveProperty('title')
    expect(meta.openGraph).toHaveProperty('description')
    expect(meta.twitter).not.toHaveProperty('title')
    expect(undefinedKeys(meta)).toEqual([])
  })
})

describe('propertyMetaTags', () => {
  it('keeps the Open Graph family (written with property=), in order', () => {
    const tags = [
      { field: 'og:image', value: '1.png' },
      { field: 'keywords', value: 'x' },
      { field: 'article:author', value: 'الف' },
      { field: 'og:image', value: '2.png' },
      { field: 'product:price:amount', value: '10' },
      { field: 'fb:app_id', value: '1' },
      { field: 'twitter:card', value: 'summary' },
    ]
    expect(propertyMetaTags(tags).map((tag) => tag.value)).toEqual([
      '1.png',
      'الف',
      '2.png',
      '10',
      '1',
    ])
  })

  it('skips rows without a field or value', () => {
    expect(
      propertyMetaTags([
        { field: ' ', value: 'x' },
        { field: 'og:type', value: '' },
      ]),
    ).toEqual([])
  })
})
