import type { CategoryCard, PostCard } from '@/lib/api/types/catalog'
import type { SearchResults, SearchSuggestions } from '@/lib/api/types/search'
import { cardFixture } from '../catalog/card-fixtures'

// Suggestions shaped like the live `search/suggest/?q=سامسونگ` (dev sample data).

const PLACEHOLDER = 'http://localhost:8000/static/defaults/default.png'

export const SAMSUNG: SearchSuggestions = {
  query: 'سامسونگ',
  products: [
    {
      id: 10023,
      name: 'شارژر دیواری سامسونگ ۲۵ وات',
      url: '/product/samsung-25w-charger/',
      image: PLACEHOLDER,
    },
    {
      id: 10013,
      name: 'تبلت سامسونگ گلکسی Tab A9 Plus',
      url: '/product/samsung-galaxy-tab-a9/',
      image: PLACEHOLDER,
    },
    {
      id: 10004,
      name: 'گوشی موبایل سامسونگ گلکسی A56',
      url: '/product/samsung-galaxy-a56/',
      image: 'http://localhost:8000/media/CACHE/images/products/a56.jpg',
    },
  ],
  product_categories: [
    {
      id: 10002,
      name: 'گوشی موبایل',
      url: '/product-category/digital/mobile-phone/',
      image: PLACEHOLDER,
    },
  ],
  brands: [{ id: 10001, name: 'سامسونگ', url: '/brand/samsung/', image: PLACEHOLDER }],
}

export function suggestions(query: string, names: string[] = []): SearchSuggestions {
  return {
    query,
    products: names.map((name, index) => ({
      id: index + 1,
      name,
      url: `/product/p-${index + 1}/`,
      image: PLACEHOLDER,
    })),
    product_categories: [],
    brands: [],
  }
}

/** What `bffFetch` resolves with. */
export function answer(data: SearchSuggestions) {
  return { data, msg: '', status: 200 }
}

const CREATED = '2025-08-15T15:00:00+03:30'

export function categoryCard(changes: Partial<CategoryCard> = {}): CategoryCard {
  return {
    id: 10002,
    name: 'گوشی موبایل',
    slug: 'mobile-phone',
    path: 'digital/mobile-phone',
    parent_id: 10001,
    short_description: null,
    image: PLACEHOLDER,
    icon: PLACEHOLDER,
    show_in_homepage: true,
    default_sorting: 'date-desc',
    product_count: 7,
    created: CREATED,
    updated: CREATED,
    ...changes,
  }
}

export function postCard(changes: Partial<PostCard> = {}): PostCard {
  return {
    id: 10001,
    name: 'بهترین گوشی های زیر ۳۰ میلیون تومان',
    slug: 'best-phones-under-30m',
    description: 'پنج گوشی که ارزش خرید دارند.',
    image: PLACEHOLDER,
    author: { full_name: 'مدیر فروشگاه', avatar: null },
    categories: [],
    comment_count: 2,
    question_count: 0,
    view_count: 4822,
    is_in_reading_list: false,
    published_at: '2026-09-01T15:00:00+03:30',
    created: CREATED,
    updated: CREATED,
    ...changes,
  }
}

/** `search/?q=گوشی` as the dev backend answers it, trimmed: every group, small. */
export function searchResults(changes: Partial<SearchResults> = {}): SearchResults {
  const products = [
    cardFixture(),
    cardFixture({
      id: 10007,
      slug: 'nokia-c32-basic',
      name: 'گوشی موبایل ساده دکمه ای',
      type: 'simple',
    }),
  ]
  return {
    query: 'گوشی',
    total: 30,
    products: {
      count: 20,
      items: products,
      listing_query: { search: 'گوشی', special_first: 'false' },
    },
    product_categories: {
      count: 1,
      items: [categoryCard()],
      listing_query: { search: 'گوشی' },
    },
    brands: {
      count: 1,
      items: [
        {
          id: 10001,
          name: 'سامسونگ',
          slug: 'samsung',
          image: PLACEHOLDER,
          product_count: 9,
          created: CREATED,
          updated: CREATED,
        },
      ],
      listing_query: { search: 'گوشی' },
    },
    blog_posts: { count: 7, items: [postCard()], listing_query: { search: 'گوشی' } },
    pages: {
      count: 1,
      items: [
        {
          id: 10003,
          title: 'راهنمای خرید گوشی',
          slug: 'phone-guide',
          url: '/page/phone-guide/',
          requires_login: false,
        },
      ],
      listing_query: { search: 'گوشی' },
    },
    ...changes,
  }
}

const EMPTY_GROUP = { count: 0, items: [], listing_query: { search: 'zzqx' } }

export function noResults(query = 'zzqx'): SearchResults {
  return {
    query,
    total: 0,
    products: { ...EMPTY_GROUP, listing_query: { search: query, special_first: 'false' } },
    product_categories: EMPTY_GROUP,
    brands: EMPTY_GROUP,
    blog_posts: EMPTY_GROUP,
    pages: EMPTY_GROUP,
  }
}
