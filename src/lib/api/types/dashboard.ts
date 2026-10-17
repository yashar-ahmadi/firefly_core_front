/**
 * Wire types of the customer dashboard (blog-faq-dashboard-notification digest §3.4, §3.5, §3.7),
 * as the browser receives them through the BFF. Pure types: safe in any bundle.
 */
import type { ProductCard } from '@/lib/api/types/catalog/product'

/** The eight order statuses, in tab order then lifecycle order. */
export type OrderStatus =
  | 'awaiting_payment'
  | 'awaiting_review'
  | 'processing'
  | 'packing'
  | 'sent'
  | 'delivered'
  | 'returned'
  | 'cancelled'

/** The five order tabs. Branch on the key; print the API's label as it is. */
export type OrderStatusGroupKey =
  'awaiting_payment' | 'in_progress' | 'delivered' | 'returned' | 'cancelled'

export interface OrderStatusGroup {
  key: OrderStatusGroupKey
  label: string
  /** The statuses the tab covers (never hard-code this mapping). */
  statuses: OrderStatus[]
  count: number
}

export interface OrderStatusCount {
  status: OrderStatus
  label: string
  count: number
}

/**
 * `GET dashboard/summary/`: every badge of the account area, from one call. Each number is the
 * `count` of the list it opens; never compute one on the client. Per user: never share-cached.
 */
export interface DashboardSummary {
  /** No wallet yet: `{ balance: 0, is_frozen: false }` (the summary never creates one). */
  wallet: {
    /** Toman, an integer. */
    balance: number
    /** The freeze message itself is in `GET wallet/` (`freeze_message`). */
    is_frozen: boolean
  }
  orders: {
    /** The sum of every group's (and every status's) count. */
    total: number
    /** Always all five, in tab order, zeros included. */
    groups: OrderStatusGroup[]
    /** Always all eight. */
    statuses: OrderStatusCount[]
  }
  /** (order, product) pairs of delivered orders still waiting for a review: not an order count. */
  awaiting_review_count: number
  wishlist_count: number
  /** Reported even while the `blog` switch is off: hide the row instead. */
  reading_list_count: number
  comment_count: number
}

/**
 * `GET dashboard/purchased-product/list/`: a product of the visitor's paid orders, newest
 * purchase first, one row per product. A catalogue card plus the date of the newest paid order.
 */
export interface PurchasedProduct extends ProductCard {
  /** ISO 8601 with the Tehran offset. */
  last_purchased_at: string
}

/** `GET dashboard/banner/list/` (public, viewer-blind): a live promo banner of the dashboard. */
export interface DashboardBanner {
  id: number
  title: string
  /** '' when none. */
  subtitle: string
  /** Absolute; always present (a placeholder when the file is missing). */
  image: string
  /** null: `image` on phones too. */
  mobile_image: string | null
  /** '' when none. */
  alt: string
  /** A storefront path (`/…`) or an absolute http(s) URL, used as is. */
  link: string
  /** Defaults to «مشاهده کنید». */
  button_label: string
}

/** Where a comment of «دیدگاه‌های من» was written (digest §3.6). */
export type CommentSubjectType = 'product' | 'post' | 'page'

/** A comment's moderation state. Print `status_display` as it is; branch on this. */
export type CommentStatus = 'pending' | 'accepted' | 'declined'

/** What the comment is on: the product, the post or the page. */
export interface MyCommentSubject {
  id: number
  /** The product's or post's name, or the page's title. */
  name: string
  slug: string
  /** The product's or post's thumbnail (a placeholder when missing); null for a page. */
  image: string | null
  /** The product's average (a float); null for a post or a page. */
  rating: number | null
}

/** A visible direct reply under one of the visitor's comments. */
export interface MyCommentReply {
  id: number
  name: string
  /** Plain text. */
  review: string
  /** The shop's own answer («پاسخ فروشگاه»). */
  is_user_admin: boolean
  created: string
}

/**
 * `GET dashboard/comment/list/`: one of the visitor's own comments on a product, a post or a
 * page, in any moderation state (withdrawn ones never come back), newest written first. `id` is
 * unique only within `subject_type`: key a row by both (`${subject_type}:${id}`).
 */
export interface MyComment {
  id: number
  subject_type: CommentSubjectType
  comment_type: 'comment' | 'question'
  status: CommentStatus
  /** «در انتظار تأیید», «تأیید شده» or «رد شده». */
  status_display: string
  /** A reply the visitor wrote under someone's comment. */
  is_reply: boolean
  /** Plain text. */
  review: string
  /** A product review's title; null otherwise. */
  title: string | null
  /** A product review's score (1–5); null otherwise. */
  rating: number | null
  /** A product review by a buyer («خریدار»); false for product questions, null for a post or a page. */
  is_verified_buyer: boolean | null
  /** The order a product review was written for; null otherwise. */
  order_code: string | null
  created: string
  subject: MyCommentSubject
  /** Visible direct replies (the shop's or other customers'), in the public thread's order. */
  replies: MyCommentReply[]
}
