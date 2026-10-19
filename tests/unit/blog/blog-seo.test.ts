import { describe, expect, it } from 'vitest'
import { blogHomeJsonLd, blogHomeMetadata, blogUnavailableMetadata } from '@/features/blog/blog-seo'
import { jsonLdString } from '@/features/seo/json-ld'

// `/blog/`'s head (the API sends no SEO fields for it) and its JSON-LD; the category's come from
// the API's fields (blog-category-page.test.tsx).

const SHOP = 'فایرفلای'

describe('blogHomeMetadata', () => {
  it('the landing: an absolute title naming the shop, canonical /blog/, the social cards', () => {
    const meta = blogHomeMetadata({}, {}, SHOP)
    expect(meta.title).toEqual({ absolute: 'وبلاگ | فایرفلای' })
    expect(meta.alternates?.canonical).toBe('/blog/')
    expect(meta.description).toBe('تازه‌ترین مطالب، راهنماهای خرید و بررسی‌های فایرفلای')
    expect(meta.openGraph).toMatchObject({
      type: 'website',
      title: 'وبلاگ | فایرفلای',
      url: '/blog/',
      siteName: SHOP,
      locale: 'fa_IR',
    })
    expect(meta.twitter).toMatchObject({ title: 'وبلاگ | فایرفلای', card: 'summary' })
    expect(meta.robots).toBeUndefined()
  })

  it('a later page: its own canonical and its number in the title, still indexable', () => {
    const meta = blogHomeMetadata({ page: '2' }, { page: 2 }, SHOP)
    expect(meta.title).toEqual({ absolute: 'وبلاگ - صفحه\u{0654} ۲ | فایرفلای' })
    expect(meta.alternates?.canonical).toBe('/blog/?page=2')
    expect(meta.robots).toBeUndefined()
  })

  it('a search: noindex, follow and no canonical (another URL than /blog/)', () => {
    const meta = blogHomeMetadata({ search: 'گوشی' }, { search: 'گوشی' }, SHOP)
    expect(meta.title).toEqual({ absolute: 'جستجوی «گوشی» در وبلاگ | فایرفلای' })
    expect(meta.robots).toEqual({ index: false, follow: true })
    expect(meta).not.toHaveProperty('alternates')
  })

  it('switched off: «وبلاگ موقتاً در دسترس نیست», never indexed', () => {
    expect(blogUnavailableMetadata(SHOP)).toEqual({
      title: { absolute: 'وبلاگ موقتاً در دسترس نیست | فایرفلای' },
      robots: { index: false, follow: false },
    })
  })
})

describe('blogHomeJsonLd', () => {
  it('a trail «خانه» › «وبلاگ» and the Blog, on the shop’s own origin', () => {
    expect(blogHomeJsonLd('https://shop.ir', SHOP)).toEqual([
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'خانه', item: 'https://shop.ir/' },
          { '@type': 'ListItem', position: 2, name: 'وبلاگ', item: 'https://shop.ir/blog/' },
        ],
      },
      {
        '@context': 'https://schema.org',
        '@type': 'Blog',
        name: 'وبلاگ فایرفلای',
        url: 'https://shop.ir/blog/',
      },
    ])
  })

  it('is written with every < escaped: a shop name holding </script> cannot end the script', () => {
    const [, blog] = blogHomeJsonLd('https://shop.ir', '</script><script>alert(1)</script>')
    const written = jsonLdString(blog!)
    expect(written).not.toContain('<')
    expect(written).toContain('\\u003c/script>')
    expect(JSON.parse(written)).toEqual(blog)
  })
})
