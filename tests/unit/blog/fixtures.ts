import type { BlogCategoryDetail, BlogCategoryListItem, PostCard } from '@/lib/api/types/blog'

/** A post as the post list sends it (blog digest §1.2). */
export function postFixture(overrides: Partial<PostCard> = {}): PostCard {
  return {
    id: 10001,
    name: 'بهترین گوشی‌های سال',
    slug: 'best-phones-under-30m',
    description: 'پنج گوشی خوب برای بودجهٔ متوسط.',
    image: 'http://localhost:8000/static/defaults/default.png',
    author: { full_name: 'سمیرا کاظمی', avatar: 'http://localhost:8000/media/avatars/s.jpg' },
    categories: [{ id: 10002, name: 'راهنمای خرید', slug: 'buying-guide', parent_id: null }],
    comment_count: 2,
    question_count: 0,
    view_count: 120,
    is_in_reading_list: false,
    published_at: '2026-09-01T15:00:00+03:30',
    created: '2026-08-30T10:00:00+03:30',
    updated: '2026-09-02T10:00:00+03:30',
    ...overrides,
  }
}

/** Posts 1…n, each its own id and slug. */
export function postsFixture(count: number, from = 1): PostCard[] {
  return Array.from({ length: count }, (_, index) =>
    postFixture({ id: from + index, slug: `post-${from + index}`, name: `مطلب ${from + index}` }),
  )
}

export function categoryListItem(
  id: number,
  path: string,
  parent_id: number | null,
  name = `دسته ${id}`,
): BlogCategoryListItem {
  return {
    id,
    name,
    slug: path.split('/').at(-1)!,
    path,
    parent_id,
    short_description: null,
    image: 'http://localhost:8000/static/defaults/default.png',
    icon: 'http://localhost:8000/static/defaults/default.png',
    post_count: 2,
    created: '',
    updated: '',
  }
}

/** `GET blog/category/mobile-blog/` as the dev backend answers it (its JSON-LD on SITE_DOMAIN). */
export function categoryDetailFixture(
  overrides: Partial<BlogCategoryDetail> = {},
): BlogCategoryDetail {
  return {
    id: 10006,
    name: 'گوشی و موبایل',
    slug: 'mobile-blog',
    path: 'tech-news/mobile-blog',
    banner_style: 'style_1',
    banners: [],
    parent_id: 10001,
    short_description: 'همه چیز درباره گوشی های هوشمند.',
    description: 'همه چیز درباره گوشی های هوشمند.',
    content: '',
    image: 'http://localhost:8000/media/CACHE/images/categories/blog-mobile.jpg',
    icon: 'http://localhost:8000/static/defaults/default.png',
    breadcrumb: [
      { id: 10001, name: 'اخبار فناوری', slug: 'tech-news', parent_id: null },
      { id: 10006, name: 'گوشی و موبایل', slug: 'mobile-blog', parent_id: 10001 },
    ],
    page_title: 'گوشی و موبایل | وبلاگ فایرفلای',
    page_description: '',
    page_keywords: '',
    canonical_link: null,
    structured_data: [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'دسته‌بندی: گوشی و موبایل',
        description: 'همه چیز درباره گوشی های هوشمند. </script><script>alert(1)</script>',
        url: 'https://localhost/blog/category/tech-news/mobile-blog/',
        isPartOf: { '@type': 'Blog', name: 'بلاگ فایرفلای', url: 'https://localhost/blog/' },
        publisher: {
          '@type': 'Organization',
          name: 'فایرفلای',
          logo: { '@type': 'ImageObject', url: 'https://localhost/media/site-logo.png' },
        },
      },
    ],
    breadcrumb_structured_data: {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'خانه', item: 'https://localhost/' },
        { '@type': 'ListItem', position: 2, name: 'بلاگ', item: 'https://localhost/blog/' },
        {
          '@type': 'ListItem',
          position: 3,
          name: 'اخبار فناوری',
          item: 'https://localhost/blog/category/tech-news/',
        },
        {
          '@type': 'ListItem',
          position: 4,
          name: 'گوشی و موبایل',
          item: 'https://localhost/blog/category/tech-news/mobile-blog/',
        },
      ],
    },
    created: '2025-12-12T15:00:00+03:30',
    updated: '2025-12-12T15:00:00+03:30',
    ...overrides,
  }
}
