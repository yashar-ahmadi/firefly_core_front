import type { BlogComment, PostDetail } from '@/lib/api/types/blog-post'
import { postFixture } from './fixtures'

/**
 * `GET blog/post/best-phones-under-30m/` as the dev backend answers it (blog digest §1.5), with a
 * third-level heading added under the second section and its JSON-LD on SITE_DOMAIN. Its
 * `content` carries the ids its `headings` list.
 */
export function postDetailFixture(overrides: Partial<PostDetail> = {}): PostDetail {
  return {
    id: 10001,
    name: 'بهترین گوشی های زیر ۳۰ میلیون تومان در سال ۱۴۰۵',
    slug: 'best-phones-under-30m',
    description:
      'اگر بودجه شما حدود ۳۰ میلیون تومان است، این پنج گوشی بهترین انتخاب های بازار هستند.',
    content:
      '<p>اگر بودجه شما حدود ۳۰ میلیون تومان است، این پنج گوشی بهترین انتخاب های بازار هستند.</p>' +
      '<h2 id="چرا-بودجه-۳۰-میلیونی">چرا بودجه ۳۰ میلیونی؟</h2>' +
      '<p>در این محدوده قیمتی می توانید گوشی هایی با نمایشگر امولد پیدا کنید.</p>' +
      '<h2 id="معیارهای-انتخاب-ما">معیارهای انتخاب ما</h2>' +
      '<h3 id="باتری">باتری</h3><p>ماندگاری باتری <a href="/blog/category/buying-guide/">راهنما</a>.</p>' +
      '<img src="/media/posts/phones.jpg" alt="گوشی\u{200C}ها">',
    headings: [
      { text: 'چرا بودجه ۳۰ میلیونی؟', id: 'چرا-بودجه-۳۰-میلیونی', level: 2, number: '1' },
      { text: 'معیارهای انتخاب ما', id: 'معیارهای-انتخاب-ما', level: 2, number: '2' },
      { text: 'باتری', id: 'باتری', level: 3, number: '2-1' },
    ],
    image: 'http://localhost:8000/media/CACHE/images/posts/best-phones.jpg',
    banner: 'http://localhost:8000/media/posts/best-phones-banner.png',
    author: { full_name: 'مدیر فروشگاه', avatar: null },
    categories: [
      { id: 10002, name: 'راهنمای خرید', slug: 'buying-guide', parent_id: null },
      { id: 10006, name: 'گوشی و موبایل', slug: 'mobile-blog', parent_id: 10001 },
    ],
    breadcrumb: [
      { id: 10001, name: 'اخبار فناوری', slug: 'tech-news', parent_id: null },
      { id: 10006, name: 'گوشی و موبایل', slug: 'mobile-blog', parent_id: 10001 },
    ],
    comment_count: 2,
    question_count: 0,
    view_count: 4823,
    is_in_reading_list: false,
    related_posts: [postFixture({ id: 10002, slug: 'galaxy-s25-ultra-review', name: 'بررسی S25' })],
    related_products: [
      {
        id: 10003,
        name: 'گوشی موبایل شیائومی ردمی نوت ۱۴ پرو',
        slug: 'xiaomi-redmi-note-14-pro',
        image: 'http://localhost:8000/static/defaults/default.png',
        in_stock: true,
        price: 17_900_000,
        final_price: 17_900_000,
        has_discount: false,
        discount_percent: 0,
        is_in_wishlist: false,
      },
    ],
    page_title: 'بهترین گوشی های زیر ۳۰ میلیون تومان در سال ۱۴۰۵',
    page_description:
      'اگر بودجه شما حدود ۳۰ میلیون تومان است، این پنج گوشی بهترین انتخاب ها هستند.',
    page_keywords: 'بهترین, گوشی',
    canonical_link: null,
    structured_data: [
      {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        mainEntityOfPage: {
          '@type': 'WebPage',
          '@id': 'https://localhost/blog/best-phones-under-30m/',
        },
        headline: 'بهترین گوشی های زیر ۳۰ میلیون تومان </script><script>alert(1)</script>',
        description: 'اگر بودجه شما حدود ۳۰ میلیون تومان است.',
        image: 'https://localhost/media/CACHE/images/posts/best-phones.jpg',
        publisher: {
          '@type': 'Organization',
          name: 'فایرفلای',
          logo: { '@type': 'ImageObject', url: 'https://localhost/media/site-logo.png' },
        },
        datePublished: '2026-09-01',
        dateModified: '2026-09-01',
        articleBody: '<p>اگر بودجه شما <strong>حدود</strong> ۳۰ میلیون تومان است.</p><h2>چرا؟</h2>',
        author: { '@type': 'Person', name: 'مدیر فروشگاه' },
        commentCount: 2,
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
      ],
    },
    is_unpublished: false,
    published_at: '2026-09-01T15:00:00+03:30',
    created: '2026-09-01T15:00:00+03:30',
    updated: '2026-09-01T15:00:00+03:30',
    ...overrides,
  }
}

/** One visible comment (blog digest §1.7). */
export function commentFixture(overrides: Partial<BlogComment> = {}): BlogComment {
  return {
    id: 10002,
    name: 'علی کریمی',
    review: 'چرا گوشی های اپل در این لیست نیستند؟',
    comment_type: 'comment',
    is_user_admin: false,
    is_current_user: false,
    parent_id: null,
    replies: [],
    created: '2026-08-21T15:00:00+03:30',
    ...overrides,
  }
}

/** The live thread of best-phones-under-30m: ali's question with the shop's answer, and sara's. */
export function liveThreads(): BlogComment[] {
  return [
    commentFixture({
      replies: [
        commentFixture({
          id: 10003,
          name: 'تیم محتوای فایرفلای',
          review: 'چون قیمت آن ها از محدوده این مقاله بالاتر است.',
          is_user_admin: true,
          parent_id: 10002,
          created: '2026-08-22T15:00:00+03:30',
        }),
      ],
    }),
    commentFixture({
      id: 10001,
      name: 'سارا احمدی',
      review: 'ممنون از مقاله کامل و کاربردی.\nمن ردمی نوت را گرفتم و راضی ام.',
      created: '2026-08-19T15:00:00+03:30',
    }),
  ]
}
