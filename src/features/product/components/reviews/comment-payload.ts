import type { CommentSubmitBody } from '@/lib/api/types/catalog'

// The comment form's values, the request body and where the API's errors go (product digest
// §3.13). Pure: safe in any bundle.

/** At most ten points per list, each up to 255 characters (the API's limits). */
export const MAX_POINTS = 10
export const MAX_POINT_LENGTH = 255

/** A root review (rating, title and points allowed), a root question, or a reply (text only). */
export type CommentMode = 'comment' | 'question' | 'reply'

export interface CommentValues {
  review: string
  /** Guests only. */
  name: string
  email: string
  /** The honeypot: empty unless a bot filled it. */
  website: string
  /** Root reviews only, from here down. */
  title: string
  rating: number | null
  positive: string[]
  negative: string[]
  /** A point typed but not added yet: sent too. */
  positiveDraft: string
  negativeDraft: string
}

export const EMPTY_VALUES: CommentValues = {
  review: '',
  name: '',
  email: '',
  website: '',
  title: '',
  rating: null,
  positive: [],
  negative: [],
  positiveDraft: '',
  negativeDraft: '',
}

/** The fields an API error can be shown under (`attr` before any `.index`). */
export type CommentField =
  'review' | 'name' | 'email' | 'title' | 'rating' | 'positive_points' | 'negative_points'

/** Trimmed, without blanks and repeats (the API rejects blanks), at most ten. */
export function cleanPoints(points: readonly string[]): string[] {
  const kept: string[] = []
  for (const point of points) {
    const text = point.trim()
    if (text && !kept.includes(text)) kept.push(text)
  }
  return kept.slice(0, MAX_POINTS)
}

export interface PayloadOptions {
  mode: CommentMode
  /** Whether the name and e-mail fields are shown (a guest, or an account lacking a name). */
  guest: boolean
  parentId?: number
}

/**
 * The submit body. Every empty optional is left out: no `email: ""` (the API answers `blank`),
 * no title, rating or points unless given, and those only on a root review. A reply names its
 * parent (its type is the parent's); a question says so.
 */
export function commentPayload(values: CommentValues, options: PayloadOptions): CommentSubmitBody {
  const body: CommentSubmitBody = { review: values.review.trim() }
  if (options.guest) {
    const name = values.name.trim()
    const email = values.email.trim()
    if (name) body.name = name
    if (email) body.email = email
  }
  if (options.mode === 'reply' && options.parentId !== undefined) body.parent = options.parentId
  if (options.mode === 'question') body.comment_type = 'question'
  if (options.mode === 'comment') {
    const title = values.title.trim()
    const positive = cleanPoints([...values.positive, values.positiveDraft])
    const negative = cleanPoints([...values.negative, values.negativeDraft])
    if (values.rating !== null) body.rating = values.rating
    if (title) body.title = title
    if (positive.length > 0) body.positive_points = positive
    if (negative.length > 0) body.negative_points = negative
  }
  if (values.website) body.website = values.website
  return body
}

/** The form's errors: under a field, or (`form`) above the buttons. */
export type CommentErrors = Partial<Record<CommentField | 'form', string>>

const FIELDS: Record<CommentMode, readonly CommentField[]> = {
  comment: ['review', 'name', 'email', 'rating', 'title', 'positive_points', 'negative_points'],
  question: ['review', 'name', 'email'],
  reply: ['review', 'name', 'email'],
}

const PARENT_GONE = 'این مورد دیگر در دسترس نیست. فهرست به\u{200C}روز شد.'

export interface PlacedErrors {
  errors: CommentErrors
  /** The answered comment is gone (`parent`): the lists are stale. */
  parentGone: boolean
}

/**
 * The API's field errors (`ApiError.fieldErrors()`) placed on the form: an indexed attr under
 * its list (`positive_points.1` under the pros), a field the mode has under that field (the name
 * too, which the form then shows), anything else above the buttons with its own message, and
 * `detail` there when nothing could be placed (no connection, not the API, too many requests).
 */
export function placeApiErrors(
  fieldErrors: Readonly<Record<string, string>>,
  mode: CommentMode,
  detail: string,
): PlacedErrors {
  const errors: CommentErrors = {}
  let parentGone = false
  for (const [attr, message] of Object.entries(fieldErrors)) {
    const key = attr.split('.')[0] ?? attr
    const field = FIELDS[mode].find((name) => name === key)
    if (field) errors[field] ??= message
    else if (key === 'parent') {
      parentGone = true
      errors.form ??= PARENT_GONE
    } else errors.form ??= message
  }
  if (Object.keys(errors).length === 0) errors.form = detail
  return { errors, parentGone }
}
