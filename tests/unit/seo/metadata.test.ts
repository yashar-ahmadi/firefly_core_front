import { describe, expect, it } from 'vitest'
import { seoMetadata } from '@/features/seo/metadata'
import { pageMetadata } from '@/features/seo/page-metadata'

/** Every key, at any depth, that is set to `undefined` (it would wipe the layout's value). */
function undefinedKeys(value: unknown, path = ''): string[] {
  if (typeof value !== 'object' || value === null) return []
  return Object.entries(value).flatMap(([key, child]) =>
    child === undefined ? [`${path}${key}`] : undefinedKeys(child, `${path}${key}.`),
  )
}

describe('seoMetadata', () => {
  it('uses the backend title as is, leaves empty fields out and canonicalises to the path', () => {
    const meta = seoMetadata({ pageTitle: 'X', description: '', path: '/a/' })
    expect(meta.title).toEqual({ absolute: 'X' })
    expect(meta).not.toHaveProperty('description')
    expect(meta).not.toHaveProperty('keywords')
    expect(meta).not.toHaveProperty('robots')
    expect(meta.alternates).toEqual({ canonical: '/a/' })
    expect(undefinedKeys(meta)).toEqual([])
  })

  it('fills the social cards: website, fa_IR, the image, a large Twitter card', () => {
    const meta = seoMetadata({
      pageTitle: 'گوشی موبایل | فروشگاه فایرفلای',
      description: 'خرید گوشی',
      keywords: 'گوشی، موبایل',
      canonical: null,
      path: '/product-category/digital/mobile-phone/',
      image: 'https://api.shop.ir/media/c.jpg',
    })
    expect(meta.description).toBe('خرید گوشی')
    expect(meta.keywords).toBe('گوشی، موبایل')
    expect(meta.openGraph).toEqual({
      type: 'website',
      locale: 'fa_IR',
      url: '/product-category/digital/mobile-phone/',
      title: 'گوشی موبایل | فروشگاه فایرفلای',
      description: 'خرید گوشی',
      images: ['https://api.shop.ir/media/c.jpg'],
    })
    expect(meta.twitter).toEqual({
      card: 'summary_large_image',
      title: 'گوشی موبایل | فروشگاه فایرفلای',
      description: 'خرید گوشی',
      images: ['https://api.shop.ir/media/c.jpg'],
    })
    expect(undefinedKeys(meta)).toEqual([])
  })

  it("prefers the operator's canonical link and keeps the path as the fallback", () => {
    expect(
      seoMetadata({ path: '/brand/apple/', canonical: 'https://shop.ir/brand/apple-iran/' })
        .alternates,
    ).toEqual({ canonical: 'https://shop.ir/brand/apple-iran/' })
    expect(seoMetadata({ path: '/brand/apple/', canonical: '  ' }).alternates).toEqual({
      canonical: '/brand/apple/',
    })
  })

  it('without a backend title sets no title, so the layout template and Next fill the cards', () => {
    const meta = seoMetadata({ path: '/product/list/', pageTitle: ' ', image: null })
    expect(meta).not.toHaveProperty('title')
    expect(meta.openGraph).not.toHaveProperty('title')
    expect(meta.openGraph).not.toHaveProperty('images')
    expect(meta.twitter).not.toHaveProperty('title')
    expect(meta.twitter).not.toHaveProperty('images')
    expect(undefinedKeys(meta)).toEqual([])
  })

  it('noindex keeps links followed', () => {
    expect(seoMetadata({ path: '/a/', noindex: true }).robots).toEqual({
      index: false,
      follow: true,
    })
    expect(seoMetadata({ path: '/a/', noindex: false })).not.toHaveProperty('robots')
  })

  it('trims what it writes', () => {
    const meta = seoMetadata({ path: '/a/', pageTitle: ' X ', description: ' d ', keywords: ' ' })
    expect(meta.title).toEqual({ absolute: 'X' })
    expect(meta.description).toBe('d')
    expect(meta).not.toHaveProperty('keywords')
  })
})

describe('pageMetadata', () => {
  const base = { title: 'T', canonical: '/', card: 'summary' as const }

  it('lets operator meta rows win over its own fields, each tag written once', () => {
    const meta = pageMetadata({
      ...base,
      description: 'ours',
      keywords: 'ours',
      metaTags: [
        { field: 'description', value: 'theirs' },
        { field: 'og:title', value: 'their og title' },
        { field: 'twitter:card', value: 'summary_large_image' },
        { field: 'author', value: 'A' },
        { field: 'author', value: 'B' },
      ],
    })
    expect(meta.description).toBe('theirs')
    expect(meta.keywords).toBe('ours')
    expect(meta.openGraph).not.toHaveProperty('title')
    expect(meta.twitter).not.toHaveProperty('card')
    // Twitter fields are name= tags: the operator's rows are written as they are.
    expect(meta.other).toEqual({ 'twitter:card': ['summary_large_image'], author: ['A', 'B'] })
  })

  it('uses the social description when there is no description of its own', () => {
    const meta = pageMetadata({ ...base, description: '', socialDescription: 'slogan' })
    expect(meta).not.toHaveProperty('description')
    expect(meta.openGraph).toMatchObject({ description: 'slogan' })
    expect(meta.twitter).toMatchObject({ description: 'slogan' })
  })
})
