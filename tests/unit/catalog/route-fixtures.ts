import type {
  BrandDetail,
  CategoryDetail,
  FiltersMetadata,
  ProductListPageDetail,
} from '@/lib/api/types/catalog'

// Detail payloads of the listing routes, as the dev backend returns them (product digest §3.3–3.7).

const PLACEHOLDER = 'http://localhost:8000/static/defaults/default.png'

function crumbs(...items: [name: string, path: string][]) {
  return {
    '@context': 'https://schema.org' as const,
    '@type': 'BreadcrumbList' as const,
    itemListElement: [['خانه', '/'] as [string, string], ...items].map(([name, path], index) => ({
      '@type': 'ListItem' as const,
      position: index + 1,
      name,
      item: `https://localhost${path}`,
    })),
  }
}

export function categoryFixture(overrides: Partial<CategoryDetail> = {}): CategoryDetail {
  return {
    id: 10002,
    name: 'گوشی موبایل',
    slug: 'mobile-phone',
    path: 'digital/mobile-phone',
    banner_style: 'style_1',
    banners: [],
    parent_id: 10001,
    short_description: 'خرید انواع گوشی موبایل از فروشگاه فایرفلای.',
    description: null,
    content: null,
    image: PLACEHOLDER,
    icon: PLACEHOLDER,
    breadcrumb: [
      { id: 10001, name: 'کالای دیجیتال', slug: 'digital', path: 'digital', parent_id: null },
      {
        id: 10002,
        name: 'گوشی موبایل',
        slug: 'mobile-phone',
        path: 'digital/mobile-phone',
        parent_id: 10001,
      },
    ],
    default_sorting: 'date-desc',
    consider_before_buying: null,
    question_answers: [],
    page_title: 'گوشی موبایل | فروشگاه فایرفلای',
    page_description: '',
    page_keywords: '',
    canonical_link: null,
    breadcrumb_structured_data: crumbs(
      ['کالای دیجیتال', '/product-category/digital/'],
      ['گوشی موبایل', '/product-category/digital/mobile-phone/'],
    ),
    created: '2025-08-15T15:00:00+03:30',
    updated: '2025-08-15T15:00:00+03:30',
    ...overrides,
  }
}

export function brandFixture(overrides: Partial<BrandDetail> = {}): BrandDetail {
  return {
    id: 10001,
    name: 'سامسونگ',
    slug: 'samsung',
    image: PLACEHOLDER,
    description: 'محصولات اصل برند سامسونگ با گارانتی معتبر.',
    content: null,
    page_title: 'خرید محصولات سامسونگ',
    page_description: 'لیست کامل محصولات سامسونگ با قیمت روز و ارسال سریع.',
    page_keywords: '',
    canonical_link: null,
    breadcrumb_structured_data: crumbs(['سامسونگ', '/brand/samsung/']),
    created: '2025-08-09T15:00:00+03:30',
    updated: '2025-08-09T15:00:00+03:30',
    ...overrides,
  }
}

export function listPageFixture(
  overrides: Partial<ProductListPageDetail> = {},
): ProductListPageDetail {
  return {
    id: 10003,
    name: 'گوشی های پرچمدار',
    slug: 'flagship-phones',
    description: 'گوشی های پرچمدار فروشگاه فایرفلای.',
    content: null,
    product_category: { id: 10002, name: 'گوشی موبایل', slug: 'mobile-phone', parent_id: 10001 },
    show_category_filter: true,
    default_sorting: 'sale',
    question_answers: [],
    page_title: 'گوشی های پرچمدار',
    page_description: '',
    page_keywords: '',
    canonical_link: null,
    breadcrumb_structured_data: crumbs(
      ['کالای دیجیتال', '/product-category/digital/'],
      ['گوشی موبایل', '/product-category/digital/mobile-phone/'],
      ['گوشی های پرچمدار', '/product/list/flagship-phones/'],
    ),
    created: '2025-11-17T15:00:00+03:30',
    updated: '2025-11-17T15:00:00+03:30',
    ...overrides,
  }
}

/** `filters/?category=digital`: the children of a root category, one of them empty. */
export function digitalFilters(): FiltersMetadata {
  const option = (id: number, name: string, slug: string, product_count: number) => ({
    id,
    name,
    slug,
    image: PLACEHOLDER,
    icon: PLACEHOLDER,
    product_count,
  })
  return {
    categories: [
      option(10002, 'گوشی موبایل', 'mobile-phone', 7),
      option(10003, 'لپ تاپ و الترابوک', 'laptop', 4),
      option(10004, 'تبلت', 'tablet', 0),
    ],
    brands: [],
    attributes: [],
    price: { min: 0, max: 0 },
    sort_options: [],
  }
}
