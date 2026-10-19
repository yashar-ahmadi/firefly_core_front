import { placeFieldErrors } from '@/features/comments/field-errors'
import { ApiError, GENERIC_ERROR_DETAIL } from '@/lib/api/errors'
import type { BlogCommentSubmitBody } from '@/lib/api/types/blog-post'

// The blog's comment form (blog digest §1.7): its values, the request body and where each answer
// of the API's error matrix goes. Pure: safe in any bundle.

/** A root comment («دیدگاه‌ها»), a root question («پرسش و پاسخ») or a reply (its parent's type). */
export type PostCommentMode = 'comment' | 'question' | 'reply'

export interface PostCommentValues {
  review: string
  /** Guests only. */
  name: string
  email: string
  /** The honeypot: empty unless a bot filled it. */
  website: string
}

export const EMPTY_POST_COMMENT: PostCommentValues = {
  review: '',
  name: '',
  email: '',
  website: '',
}

/** The fields an error can be shown under. */
export const POST_COMMENT_FIELDS = ['review', 'name', 'email'] as const
export type PostCommentField = (typeof POST_COMMENT_FIELDS)[number]
export type PostCommentErrors = Partial<Record<PostCommentField | 'form', string>>

export interface PostCommentOptions {
  mode: PostCommentMode
  /** The name and e-mail fields are shown (a guest, or a session the API no longer took). */
  guest: boolean
  /** The comment answered (mode `reply`). */
  parentId?: number
}

/**
 * The submit body. Every empty optional is left out: no blank name or e-mail (the API refuses a
 * blank e-mail), no `comment_type` for a comment (the default) nor for a reply (it inherits its
 * parent's), the honeypot only when filled (a bot then gets the same 201 and nothing is saved).
 */
export function postCommentBody(
  values: PostCommentValues,
  { mode, guest, parentId }: PostCommentOptions,
): BlogCommentSubmitBody {
  const body: BlogCommentSubmitBody = { review: values.review.trim() }
  if (guest) {
    const name = values.name.trim()
    const email = values.email.trim()
    if (name) body.name = name
    if (email) body.email = email
  }
  if (mode === 'question') body.comment_type = 'question'
  if (mode === 'reply' && parentId !== undefined) body.parent = parentId
  if (values.website) body.website = values.website
  return body
}

const POST_GONE = 'این مطلب دیگر در دسترس نیست.'
export const THROTTLED = 'لطفاً کمی بعد دوباره تلاش کنید.'

/** What a refused submission means for the form. */
export interface PostCommentFailure {
  errors: PostCommentErrors
  /** The answered comment is gone: the lists are stale (read again). */
  parentGone: boolean
  /** The post itself is gone (404): unpublished or deleted meanwhile. */
  postGone: boolean
  /** A 429's wait (`data.retry_after`): the send button waits it out. */
  waitSeconds: number | null
  /** A switch turned off (`503 feature_disabled`): `blog` or `blog_comments`, with its reason. */
  feature: { key: string; reason: string } | null
  /** A name or e-mail error: the API took the visitor for a guest (their session ended). */
  askName: boolean
}

const NONE: Omit<PostCommentFailure, 'errors'> = {
  parentGone: false,
  postGone: false,
  waitSeconds: null,
  feature: null,
  askName: false,
}

/**
 * Where the API's answer goes (the digest's error matrix): field errors (`required`, `blank`,
 * `max_length`, `invalid` on review, name or email; several at once) under their fields; a
 * `parent` error (`does_not_exist`, `incorrect_type`, `invalid`) above the buttons, the lists
 * read again; `comment_type` and every other code (405, 413, an API key's 401) above the buttons
 * with its message; a 404 says the post is gone; a 429 waits `retry_after`; a 503 names the
 * switch (the shell's feature map turns it off: the form or the blog go); anything that is not
 * the API, the generic sentence.
 */
export function postCommentFailure(error: unknown): PostCommentFailure {
  if (!(error instanceof ApiError)) return { ...NONE, errors: { form: GENERIC_ERROR_DETAIL } }
  if (error.isFeatureDisabled()) {
    return { ...NONE, errors: {}, feature: { key: error.feature ?? 'blog', reason: error.detail } }
  }
  if (error.status === 429) {
    return { ...NONE, errors: { form: THROTTLED }, waitSeconds: error.retryAfter }
  }
  if (error.status === 404) return { ...NONE, errors: { form: POST_GONE }, postGone: true }
  const { errors, parentGone } = placeFieldErrors(
    error.fieldErrors(),
    POST_COMMENT_FIELDS,
    error.detail,
  )
  return { ...NONE, errors, parentGone, askName: Boolean(errors.name || errors.email) }
}
