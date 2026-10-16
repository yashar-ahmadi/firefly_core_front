import type { HomeItem, HomeSection, PostCard } from '@/lib/api/types/catalog'
import type { CategoryCard } from '@/lib/api/types/settings'
import { cardFixture } from '../catalog/card-fixtures'

// Homepage sections shaped like `GET /api/v1/homepage/` in dev (2026-10-16). Every section carries
// all six content keys; the ones its type does not use are null.

const MEDIA = 'http://localhost:8000/media'

const EMPTY = {
  items: null,
  products: null,
  listing_query: null,
  categories: null,
  posts: null,
  content: null,
} as const

const HEAD = { title: '', subtitle: '', link: null }

/** Slide 1 of the dev slider: a mobile image, white text and a CTA. */
export function slideFixture(overrides: Partial<HomeItem> = {}): HomeItem {
  return {
    id: 10001,
    title: 'کمپین جمعه\u{0654} سیاه',
    description: 'تخفیف ویژه روی کالای دیجیتال و لوازم خانگی',
    image: `${MEDIA}/posts/26/09/13/black-friday-guide-banner.png`,
    mobile_image: `${MEDIA}/posts/26/09/13/black-friday-guide.png`,
    text_color: '#FFFFFF',
    alt: 'بنر کمپین جمعه\u{0654} سیاه فایرفلای',
    link: { url: '/blog/black-friday-guide/', title: 'راهنمای خرید کمپین' },
    ...overrides,
  }
}

export function sliderSection(items: HomeItem[], id = 10001): HomeSection {
  return { id, type: 'slider', ...HEAD, ...EMPTY, items }
}

export function bannerSection(items: HomeItem[], id = 10005): HomeSection {
  return { id, type: 'banner_group', ...HEAD, ...EMPTY, items }
}

/** `count` banners, each with its own id and image. */
export function banners(count: number): HomeItem[] {
  return Array.from({ length: count }, (_, index) =>
    slideFixture({
      id: 20000 + index,
      title: `بنر ${index + 1}`,
      description: '',
      image: `${MEDIA}/banners/${index + 1}.png`,
      mobile_image: null,
      text_color: '',
      alt: `بنر شماره ${index + 1}`,
      link: { url: `/product/item-${index + 1}/`, title: 'خرید' },
    }),
  )
}

export function productCarousel(
  overrides: Partial<Extract<HomeSection, { type: 'product_carousel' }>> = {},
): HomeSection {
  return {
    id: 10002,
    type: 'product_carousel',
    ...HEAD,
    title: 'پیشنهاد ویژه\u{0654} فایرفلای',
    subtitle: 'منتخب کارشناسان ما برای این هفته',
    ...EMPTY,
    products: [cardFixture()],
    listing_query: null,
    ...overrides,
  }
}

export function categoryFixture(overrides: Partial<CategoryCard> = {}): CategoryCard {
  return {
    id: 10002,
    name: 'گوشی موبایل',
    slug: 'mobile-phone',
    path: 'digital/mobile-phone',
    parent_id: 10001,
    short_description: null,
    image: 'http://localhost:8000/static/defaults/default.png',
    icon: 'http://localhost:8000/static/defaults/default.png',
    show_in_homepage: true,
    default_sorting: 'date-desc',
    product_count: 7,
    created: '2025-08-14T15:00:00+03:30',
    updated: '2025-08-14T15:00:00+03:30',
    ...overrides,
  }
}

export function categoryGrid(categories: CategoryCard[]): HomeSection {
  return {
    id: 10003,
    type: 'category_grid',
    ...HEAD,
    title: 'خرید بر اساس دسته\u{200C}بندی',
    ...EMPTY,
    categories,
  }
}

export function postFixture(overrides: Partial<PostCard> = {}): PostCard {
  return {
    id: 10001,
    name: 'بهترین گوشی های زیر ۳۰ میلیون تومان در سال ۱۴۰۵',
    slug: 'best-phones-under-30m',
    description:
      'اگر بودجه شما حدود ۳۰ میلیون تومان است، این پنج گوشی بهترین انتخاب های بازار هستند.',
    image: `${MEDIA}/CACHE/images/posts/26/09/13/best-phones-under-30m/feba93f16dd49dd91731bd6cfecf1abe.jpg`,
    author: { full_name: 'مدیر فروشگاه', avatar: null },
    categories: [],
    comment_count: 2,
    question_count: 0,
    view_count: 4822,
    is_in_reading_list: false,
    published_at: '2026-09-01T15:00:00+03:30',
    created: '2026-09-01T15:00:00+03:30',
    updated: '2026-09-01T15:00:00+03:30',
    ...overrides,
  }
}

export function postCarousel(posts: PostCard[]): HomeSection {
  return {
    id: 10010,
    type: 'post_carousel',
    ...HEAD,
    title: 'از بلاگ فایرفلای',
    link: { url: '/blog/', title: 'همه\u{0654} مطالب' },
    ...EMPTY,
    posts,
  }
}

export function richText(content: string, id = 10011): HomeSection {
  return {
    id,
    type: 'rich_text',
    ...HEAD,
    title: 'چرا فایرفلای؟',
    ...EMPTY,
    content,
  }
}

/** A section type this storefront does not know (a newer backend). */
export function unknownSection(): HomeSection {
  return { id: 99999, type: 'video_wall', ...HEAD, ...EMPTY } as unknown as HomeSection
}
