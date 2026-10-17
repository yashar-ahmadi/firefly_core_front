import type { DashboardBanner, DashboardSummary, PurchasedProduct } from '@/lib/api/types/dashboard'

// Dashboard fixtures shaped like the live API's answers for sara (dev sample data), with counts
// changed so that no two badges show the same number.

/** `GET dashboard/summary/`: the five groups and eight statuses exactly as the API orders them. */
export function summary(changes: Partial<DashboardSummary> = {}): DashboardSummary {
  return {
    wallet: { balance: 3_031_000, is_frozen: false },
    orders: {
      total: 7,
      groups: [
        {
          key: 'awaiting_payment',
          label: 'در انتظار پرداخت',
          statuses: ['awaiting_payment'],
          count: 1,
        },
        {
          key: 'in_progress',
          label: 'جاری',
          statuses: ['awaiting_review', 'processing', 'packing', 'sent'],
          count: 2,
        },
        { key: 'delivered', label: 'تحویل داده شده', statuses: ['delivered'], count: 4 },
        { key: 'returned', label: 'مرجوعی', statuses: ['returned'], count: 0 },
        { key: 'cancelled', label: 'لغو شده', statuses: ['cancelled'], count: 0 },
      ],
      statuses: [
        { status: 'awaiting_payment', label: 'در انتظار پرداخت', count: 1 },
        { status: 'awaiting_review', label: 'در انتظار بررسی', count: 0 },
        { status: 'processing', label: 'در حال انجام', count: 2 },
        { status: 'packing', label: 'بسته‌بندی', count: 0 },
        { status: 'sent', label: 'ارسال شده', count: 0 },
        { status: 'delivered', label: 'تکمیل شده', count: 4 },
        { status: 'returned', label: 'مسترد شده', count: 0 },
        { status: 'cancelled', label: 'لغو شده', count: 0 },
      ],
    },
    awaiting_review_count: 3,
    wishlist_count: 2,
    reading_list_count: 1,
    comment_count: 5,
    ...changes,
  }
}

const PLACEHOLDER_IMAGE = 'http://localhost:8000/static/defaults/default.png'

/** One row of `GET dashboard/purchased-product/list/`. */
export function purchased(changes: Partial<PurchasedProduct> = {}): PurchasedProduct {
  return {
    id: 10020,
    name: 'پاوربانک انکر ۲۰۰۰۰ میلی آمپرساعت',
    slug: 'anker-powerbank-20000',
    extra_detail: null,
    image: PLACEHOLDER_IMAGE,
    type: 'simple',
    badge: { id: 10001, name: 'پرفروش', badge_color: '#FF6D00', text_color: '#FFFFFF' },
    brand: { id: 10025, name: 'انکر', slug: 'anker', image: PLACEHOLDER_IMAGE },
    categories: [
      { id: 10007, name: 'لوازم جانبی موبایل', slug: 'mobile-accessories', parent_id: 10001 },
    ],
    in_stock: true,
    is_special_product: false,
    is_collection: false,
    enable_major: false,
    rating: 5,
    rating_count: 1,
    default_variant_id: 10042,
    default_variant_attributes: [],
    price: 3_890_000,
    final_price: 3_890_000,
    has_discount: false,
    discount_percent: 0,
    discount_end_time: null,
    discount_time_remaining: null,
    order_limit_min: 1,
    order_limit_max: 0,
    is_in_wishlist: false,
    created: '2026-01-13T15:00:00+03:30',
    updated: '2026-10-15T22:41:18.761105+03:30',
    last_purchased_at: '2026-09-09T15:00:00+03:30',
    ...changes,
  }
}

/** sara's four latest purchases (`limit=4`), newest first. */
export const PURCHASES: PurchasedProduct[] = [
  purchased(),
  purchased({ id: 10016, name: 'هدفون انکر Soundcore Life Q30', slug: 'anker-soundcore-life-q30' }),
  purchased({
    id: 10055,
    name: 'دفتر یادداشت A5 جلد سخت',
    slug: 'notebook-a5-hardcover',
    type: 'variable',
    last_purchased_at: '2026-09-06T15:00:00+03:30',
  }),
  purchased({
    id: 10054,
    name: 'دوره آموزش آنلاین سئو',
    slug: 'online-course-seo',
    type: 'virtual',
    last_purchased_at: '2026-08-19T15:00:00+03:30',
  }),
]

/** A BFF answer as `bffFetch` resolves it. */
export function ok<T>(data: T) {
  return { data, msg: 'درخواست با موفقیت انجام شد.', status: 200 }
}

/** A paginated list as the API wraps one. */
export function page<T>(results: T[], count = results.length) {
  return {
    count,
    total_pages: Math.max(1, Math.ceil(count / Math.max(1, results.length))),
    current_page: 1,
    page_size: results.length,
    next: null,
    previous: null,
    results,
  }
}

/** One row of `GET dashboard/banner/list/` (the dev data has none: shaped from the guide). */
export function banner(changes: Partial<DashboardBanner> = {}): DashboardBanner {
  return {
    id: 1,
    title: 'جشنواره پاییزه',
    subtitle: 'تا ۳۰٪ تخفیف لوازم جانبی',
    image: 'http://localhost:8000/media/banners/autumn.jpg',
    mobile_image: null,
    alt: '',
    link: '/product/list/autumn/',
    button_label: 'مشاهده کنید',
    ...changes,
  }
}
