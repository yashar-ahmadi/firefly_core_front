/** Product reviews, questions and the back-in-stock request (product digest §3.12–3.14). Pure types. */
import type { CommentType } from '@/lib/api/types/catalog/enums'

/** One approved review or question, with its replies (newest first, at any depth). */
export interface ProductComment {
  /** Use as `parent` when replying. */
  id: number
  /** Author display name; «کاربر» for nameless accounts. */
  name: string
  /** Only on root reviews. */
  title: string | null
  /** Plain text: escape it. */
  review: string
  /** null on replies, questions and unrated reviews. */
  rating: 1 | 2 | 3 | 4 | 5 | null
  positive_points: string[]
  negative_points: string[]
  /** Replies inherit the parent's type. */
  comment_type: CommentType
  /** An official shop reply written in the panel. */
  is_user_admin: boolean
  is_verified_buyer: boolean
  /** The viewer wrote it; always false for guests. */
  is_current_user: boolean
  parent_id: number | null
  replies: ProductComment[]
  created: string
}

/** `POST product/detail/<slug>/comment/submit/`. */
export interface CommentSubmitBody {
  /** Required, ≤ 4096. */
  review: string
  /** Required for guests (≤ 255); ignored with a valid token. */
  name?: string
  /** Guests only; a valid email when sent. */
  email?: string | null
  /** Default 'comment'; ignored on replies. */
  comment_type?: CommentType
  /** An approved comment of the same product. */
  parent?: number | null
  /** 1..5, root reviews only; omit for "no rating" (0 is an error). */
  rating?: number | null
  /** ≤ 255, root reviews only. */
  title?: string
  /** ≤ 10 items of 1..255 characters, root reviews only. */
  positive_points?: string[]
  negative_points?: string[]
  /** Honeypot: render hidden and leave empty. */
  website?: string
}

/** `POST product/detail/<slug>/notify/`. Logged-in customers may send `{}`. */
export interface StockNotifyBody {
  /** Required for guests, ≤ 200. */
  first_name?: string
  /** Required for guests, ≤ 200. */
  last_name?: string
  /** Required for guests: "09121234567" or "+989121234567". */
  mobile_number?: string
}
