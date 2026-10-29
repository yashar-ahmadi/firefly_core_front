import type { Metadata } from 'next'
import { describe, expect, it } from 'vitest'
import {
  contentPageJsonLd,
  contentPageMetadata,
  contentPageTitle,
} from '@/features/content/pages/page-seo'
import { jsonLdString } from '@/features/seo/json-ld'
import { pageFixture } from './page-fixtures'

// A content page's head (content digest §3.2, seo digest §7.1): its title, description, keywords
// and canonical from the SEO fields, the operator's meta rows split by kind (`property=` rows are
// the page's own, `name=` rows go through `metadata.other`), never a key set to `undefined` (it
// would wipe the layout's), and a staff preview never indexed.

const SHOP = 'فایرفلای'
const SITE = 'https://shop.ir'
const meta = (overrides: Parameters<typeof pageFixture>[0] = {}) =>
  contentPageMetadata(pageFixture(overrides), SHOP, SITE)

/** The paths of every key holding `undefined`, at any depth. */
function undefinedKeys(value: unknown, path = ''): string[] {
  if (value === null || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, child]) =>
    child === undefined ? [`${path}${key}`] : undefinedKeys(child, `${path}${key}.`),
  )
}

describe('contentPageTitle', () => {
  it('the bare page title (the API’s fallback) gets the shop’s name', () => {
    expect(contentPageTitle({ page_title: 'درباره ما', title: 'درباره ما' }, SHOP)).toBe(
      'درباره ما | فایرفلای',
    )
  })

  it('an SEO title that names the shop already is written as it is', () => {
    const page = { page_title: 'درباره فروشگاه فایرفلای', title: 'درباره ما' }
    expect(contentPageTitle(page, SHOP)).toBe('درباره فروشگاه فایرفلای')
  })
})

describe('contentPageMetadata', () => {
  it('the dev backend’s about-us: an absolute title, a self canonical with its slash, no description or keywords', () => {
    const head = meta()
    expect(head.title).toEqual({ absolute: 'درباره ما | فایرفلای' })
    expect(head.alternates).toEqual({ canonical: '/page/about-us/' })
    expect(head).not.toHaveProperty('description')
    expect(head).not.toHaveProperty('keywords')
    expect(head).not.toHaveProperty('robots')
    expect(head).not.toHaveProperty('other')
    expect(head.openGraph).toMatchObject({
      type: 'website',
      url: '/page/about-us/',
      locale: 'fa_IR',
    })
  })

  it('never sets a key to undefined, whatever is unset', () => {
    const sparse: Metadata[] = [
      meta(),
      meta({ page_description: '', page_keywords: '', meta_tags: [] }),
      meta({ requires_login: true }),
      meta({ meta_tags: [{ field: 'og:image', value: 'https://cdn.shop.ir/a.png' }] }),
      meta({ is_unpublished: true }),
    ]
    for (const head of sparse) expect(undefinedKeys(head)).toEqual([])
  })

  it('description: page_description (the API fills it from the content); none when ""', () => {
    expect(meta({ page_description: 'درباره فروشگاه.' }).description).toBe('درباره فروشگاه.')
    expect(meta({ page_description: '' })).not.toHaveProperty('description')
  })

  it('a page for signed-in visitors only is noindex, nofollow', () => {
    expect(meta({ requires_login: true }).robots).toEqual({ index: false, follow: false })
    expect(meta({ requires_login: false })).not.toHaveProperty('robots')
  })

  it('keywords when set', () => {
    expect(meta({ page_keywords: 'فروشگاه, درباره' }).keywords).toBe('فروشگاه, درباره')
  })

  it('the operator’s canonical: a path on this shop gets its slash; another site’s as written', () => {
    expect(meta({ canonical_link: 'https://shop.ir/about' }).alternates).toEqual({
      canonical: 'https://shop.ir/about/',
    })
    expect(meta({ canonical_link: 'https://other.ir/a' }).alternates).toEqual({
      canonical: 'https://other.ir/a',
    })
  })

  it('a Persian slug’s own canonical is its encoded path', () => {
    expect(meta({ slug: 'شرایط-ارسال' }).alternates).toEqual({
      canonical: `/page/${encodeURIComponent('شرایط-ارسال')}/`,
    })
  })

  it('meta rows: name= ones through `other`, in order with repeats; property= ones left to the page', () => {
    const head = meta({
      meta_tags: [
        { field: 'og:image', value: 'https://cdn.shop.ir/a.png' },
        { field: 'twitter:site', value: '@firefly' },
        { field: 'article:author', value: 'تیم' },
        { field: 'twitter:site', value: '@firefly_ir' },
        { field: 'google-site-verification', value: 'abc' },
      ],
    })
    expect(head.other).toEqual({
      'twitter:site': ['@firefly', '@firefly_ir'],
      'google-site-verification': ['abc'],
    })
    // The operator wrote og:image: ours is left out (no second, conflicting tag).
    expect(head.openGraph).not.toHaveProperty('images')
  })

  it('a staff preview of a draft is never indexed', () => {
    expect(meta({ is_unpublished: true }).robots).toEqual({ index: false, follow: false })
  })
})

describe('contentPageJsonLd', () => {
  it('the trail on the shop’s origin, «خانه» then the page; escaped when written', () => {
    const [, data] = contentPageJsonLd(pageFixture({ title: 'درباره </script> ما' }), SITE)
    expect(data).toMatchObject({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { position: 1, name: 'خانه', item: 'https://shop.ir/' },
        { position: 2, name: 'درباره </script> ما', item: 'https://shop.ir/page/about-us/' },
      ],
    })
    expect(jsonLdString(data!)).not.toContain('</script>')
  })
})
