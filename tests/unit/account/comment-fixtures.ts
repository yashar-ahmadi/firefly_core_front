import type { MyComment } from '@/lib/api/types/dashboard'
import type { Paginated } from '@/lib/api/types/common'

// «دیدگاه‌های من» fixtures: sara's four rows exactly as `GET dashboard/comment/list/` answers in
// dev (2026-10-17; three of them share id 10001), plus rows shaped from the digest (§3.6) for the
// states she has none of: a reply she wrote, a pending question, a declined review.

const PLACEHOLDER = 'http://localhost:8000/static/defaults/default.png'

export const PAGE_10001: MyComment = {
  id: 10001,
  subject_type: 'page',
  comment_type: 'comment',
  status: 'accepted',
  status_display: 'تأیید شده',
  is_reply: false,
  review:
    'از سال ۱۳۹۹ از فایرفلای خرید می‌کنم و همهٔ کالاها اصل و سالم به دستم رسیده است. خسته نباشید.',
  title: null,
  rating: null,
  is_verified_buyer: null,
  order_code: null,
  created: '2026-09-21T15:00:00+03:30',
  subject: { id: 1, name: 'درباره ما', slug: 'about-us', image: null, rating: null },
  replies: [
    {
      id: 10002,
      name: 'مدیر فروشگاه',
      review: 'سپاس از همراهی چندساله‌تان؛ خوشحالیم که از خریدهایتان راضی بوده‌اید.',
      is_user_admin: true,
      created: '2026-09-22T15:00:00+03:30',
    },
  ],
}

export const POST_10001: MyComment = {
  id: 10001,
  subject_type: 'post',
  comment_type: 'comment',
  status: 'accepted',
  status_display: 'تأیید شده',
  is_reply: false,
  review: 'ممنون از مقاله کامل و کاربردی. من ردمی نوت را گرفتم و راضی ام.',
  title: null,
  rating: null,
  is_verified_buyer: null,
  order_code: null,
  created: '2026-08-19T15:00:00+03:30',
  subject: {
    id: 10001,
    name: 'بهترین گوشی های زیر ۳۰ میلیون تومان در سال ۱۴۰۵',
    slug: 'best-phones-under-30m',
    image: PLACEHOLDER,
    rating: null,
  },
  replies: [],
}

export const PRODUCT_10014: MyComment = {
  id: 10014,
  subject_type: 'product',
  comment_type: 'comment',
  status: 'accepted',
  status_display: 'تأیید شده',
  is_reply: false,
  review: 'سیب زمینی سرخ کرده بدون روغن واقعا خوشمزه می شود.',
  title: 'خرید خوبی بود',
  rating: 5,
  is_verified_buyer: true,
  order_code: null,
  created: '2026-07-24T15:00:00+03:30',
  subject: {
    id: 10031,
    name: 'سرخ کن بدون روغن تفال مدل XL',
    slug: 'tefal-air-fryer-xl',
    image: PLACEHOLDER,
    rating: 5,
  },
  replies: [],
}

export const PRODUCT_10001: MyComment = {
  id: 10001,
  subject_type: 'product',
  comment_type: 'comment',
  status: 'accepted',
  status_display: 'تأیید شده',
  is_reply: false,
  review: 'دوربینش واقعا عالیه و باتری یک روز کامل جواب میده. بسته بندی و ارسال هم مرتب بود.',
  title: 'بهترین گوشی که داشتم',
  rating: 5,
  is_verified_buyer: true,
  order_code: null,
  created: '2026-06-15T15:00:00+03:30',
  subject: {
    id: 10001,
    name: 'گوشی موبایل سامسونگ گلکسی S25 اولترا',
    slug: 'samsung-galaxy-s25-ultra',
    image: PLACEHOLDER,
    rating: 4,
  },
  replies: [],
}

/** sara's list, newest first. */
export const SARA_COMMENTS: MyComment[] = [PAGE_10001, POST_10001, PRODUCT_10014, PRODUCT_10001]

/** A reply sara wrote under someone's comment on a post (shaped from §3.6). */
export const POST_REPLY: MyComment = {
  ...POST_10001,
  id: 10007,
  is_reply: true,
  review: 'با شما موافقم.\nمن هم همین را خریدم.',
  created: '2026-10-01T10:00:00+03:30',
}

/** A pending product question (shaped from §3.6): no «خریدار», no stars. */
export const PENDING_QUESTION: MyComment = {
  ...PRODUCT_10001,
  id: 10020,
  comment_type: 'question',
  status: 'pending',
  status_display: 'در انتظار تأیید',
  review: 'آیا این گوشی از شارژ بی‌سیم پشتیبانی می‌کند؟',
  title: null,
  rating: null,
  is_verified_buyer: false,
  created: '2026-10-10T10:00:00+03:30',
}

/** A declined review written for a purchase (shaped from §3.6). */
export const DECLINED_REVIEW: MyComment = {
  ...PRODUCT_10014,
  id: 10021,
  status: 'declined',
  status_display: 'رد شده',
  order_code: 'FF-1405-0042',
  created: '2026-10-11T10:00:00+03:30',
}

/** A list page as the API answers it. */
export function commentsPage(
  results: MyComment[],
  { count = results.length, page = 1, totalPages = 1 } = {},
): Paginated<MyComment> {
  return {
    count,
    total_pages: totalPages,
    current_page: page,
    page_size: 20,
    next: null,
    previous: null,
    results,
  }
}
