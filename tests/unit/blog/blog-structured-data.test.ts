import { describe, expect, it } from 'vitest'
import { blogBreadcrumb, blogStructuredData } from '@/features/blog/blog-structured-data'

// The blog's structured data as the backend writes it (blog/services/structured_data.py), set
// right for the shop: every URL on the shop's origin, no empty URL (the shop without a logo sends
// `publisher.logo.url: ""`), and the blog named as the shop names it, «وبلاگ» (the backend says
// «بلاگ» in the trail and in the Blog a category page is part of).

const ORIGIN = 'https://shop.ir'

describe('blogStructuredData', () => {
  it('moves every URL field onto the shop’s origin, at any depth', () => {
    expect(
      blogStructuredData(
        {
          '@type': 'BlogPosting',
          mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://localhost/blog/x/' },
          image: 'https://localhost/media/a.jpg',
          publisher: { logo: { '@type': 'ImageObject', url: 'https://localhost/media/logo.png' } },
        },
        ORIGIN,
      ),
    ).toEqual({
      '@type': 'BlogPosting',
      mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://shop.ir/blog/x/' },
      image: 'https://shop.ir/media/a.jpg',
      publisher: { logo: { '@type': 'ImageObject', url: 'https://shop.ir/media/logo.png' } },
    })
  })

  it('drops an empty URL field, and a node it leaves naming nothing but its type', () => {
    expect(
      blogStructuredData(
        {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          url: 'https://localhost/blog/category/x/',
          image: ' ',
          publisher: {
            '@type': 'Organization',
            name: 'فایرفلای',
            logo: { '@type': 'ImageObject', url: '' },
          },
        },
        ORIGIN,
      ),
    ).toEqual({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      url: 'https://shop.ir/blog/category/x/',
      publisher: { '@type': 'Organization', name: 'فایرفلای' },
    })
  })

  it('names the Blog «وبلاگ», as the shop does; any other name and text as written', () => {
    expect(
      blogStructuredData(
        {
          '@type': 'CollectionPage',
          name: 'دسته‌بندی: بلاگ‌نویسی',
          isPartOf: { '@type': 'Blog', name: 'بلاگ فایرفلای', url: 'https://localhost/blog/' },
        },
        ORIGIN,
      ),
    ).toEqual({
      '@type': 'CollectionPage',
      name: 'دسته‌بندی: بلاگ‌نویسی',
      isPartOf: { '@type': 'Blog', name: 'وبلاگ فایرفلای', url: 'https://shop.ir/blog/' },
    })
  })
})

describe('blogBreadcrumb', () => {
  it('the trail on the shop’s origin, its blog step named «وبلاگ» as the visible trail', () => {
    const list = blogBreadcrumb(
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'خانه', item: 'https://localhost/' },
          { '@type': 'ListItem', position: 2, name: 'بلاگ', item: 'https://localhost/blog/' },
          {
            '@type': 'ListItem',
            position: 3,
            name: 'بلاگ',
            item: 'https://localhost/blog/category/b/',
          },
        ],
      },
      `${ORIGIN}/`,
    )
    expect(list.itemListElement.map(({ name, item }) => [name, item])).toEqual([
      ['خانه', 'https://shop.ir/'],
      ['وبلاگ', 'https://shop.ir/blog/'],
      ['بلاگ', 'https://shop.ir/blog/category/b/'],
    ])
  })
})
