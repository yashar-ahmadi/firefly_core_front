import type { ProductComment } from '@/lib/api/types/catalog'

// Comments shaped like the live S25 Ultra list (GET product/detail/<slug>/comment/list/).

export function comment(changes: Partial<ProductComment> = {}): ProductComment {
  return {
    id: 10002,
    name: 'محمد رضایی',
    title: 'عالی ولی گران',
    review: 'کیفیت ساخت بی نظیره اما قیمتش نسبت به سال قبل خیلی بالا رفته.',
    rating: 4,
    positive_points: ['کیفیت ساخت', 'ارسال سریع'],
    negative_points: [],
    comment_type: 'comment',
    is_user_admin: false,
    is_verified_buyer: true,
    is_current_user: false,
    parent_id: null,
    replies: [],
    created: '2026-06-18T15:00:00+03:30',
    ...changes,
  }
}

/** A reply (no title, rating or points), as the API nests it. */
export function reply(id: number, created: string, changes: Partial<ProductComment> = {}) {
  return comment({
    id,
    name: 'فروشگاه',
    title: null,
    review: `پاسخ ${id}`,
    rating: null,
    positive_points: [],
    negative_points: [],
    is_verified_buyer: false,
    parent_id: 10002,
    created,
    ...changes,
  })
}

/** One page of `Paginated<ProductComment>`. */
export function commentPage(results: ProductComment[], page = 1, totalPages = 1) {
  return {
    count: results.length,
    total_pages: totalPages,
    current_page: page,
    page_size: 20,
    next: null,
    previous: null,
    results,
  }
}
