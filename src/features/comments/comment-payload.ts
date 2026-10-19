import { placeFieldErrors } from '@/features/comments/field-errors'
import type { CommentMode } from '@/features/comments/form-copy'
import { subjectRules, type CommentSubjectKind } from '@/features/comments/subjects'
import { ApiError, GENERIC_ERROR_DETAIL } from '@/lib/api/errors'
import type { SubjectCommentSubmitBody } from '@/lib/api/types/subject-comment'

// The comment form of a blog post and of a content page (blog digest §1.7, content digest §4.2):
// its values, the request body and where each answer of the API's error matrix goes. Pure: safe
// in any bundle.

export interface CommentValues {
  review: string
  /** Guests only. */
  name: string
  email: string
  /** The honeypot: empty unless a bot filled it. */
  website: string
}

export const EMPTY_COMMENT: CommentValues = { review: '', name: '', email: '', website: '' }

/** The fields an error can be shown under. */
export const COMMENT_FIELDS = ['review', 'name', 'email'] as const
export type CommentField = (typeof COMMENT_FIELDS)[number]
export type CommentErrors = Partial<Record<CommentField | 'form', string>>

export interface CommentOptions {
  mode: CommentMode
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
export function commentBody(
  values: CommentValues,
  { mode, guest, parentId }: CommentOptions,
): SubjectCommentSubmitBody {
  const body: SubjectCommentSubmitBody = { review: values.review.trim() }
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

export const THROTTLED = 'لطفاً کمی بعد دوباره تلاش کنید.'
/** A page's form closed by the operator meanwhile (`403 page_comments_disabled`). */
const COMMENTS_CLOSED = 'page_comments_disabled'

/** What a refused submission means for the form. */
export interface CommentFailure {
  errors: CommentErrors
  /** The answered comment is gone: the lists are stale (read again). */
  parentGone: boolean
  /** The subject itself is gone (404): unpublished or deleted meanwhile. */
  subjectGone: boolean
  /** A 429's wait (`data.retry_after`): the send button waits it out. */
  waitSeconds: number | null
  /** A switch turned off (`503 feature_disabled`): `blog` or `blog_comments`, with its reason. */
  feature: { key: string; reason: string } | null
  /** The operator closed this subject's form (a page's 403): its sentence; the forms go. */
  closed: string | null
  /** A name or e-mail error: the API took the visitor for a guest (their session ended). */
  askName: boolean
}

const NONE: Omit<CommentFailure, 'errors'> = {
  parentGone: false,
  subjectGone: false,
  waitSeconds: null,
  feature: null,
  closed: null,
  askName: false,
}

/**
 * Where the API's answer goes (the digests' error matrices): field errors (`required`, `blank`,
 * `null`, `max_length`, `invalid` on review, name or email; several at once) under their fields;
 * a `parent` error (`does_not_exist`, `incorrect_type`, `invalid`) above the buttons, the lists
 * read again; `comment_type` and every other code (`parse_error`, 405, 413, 415, an API key's
 * 401) above the buttons with its message; a 403 `page_comments_disabled` closes the form with
 * its sentence; a 404 says the subject is gone; a 429 waits `retry_after`; a 503 names the switch
 * (the shell's feature map turns it off: the form or the blog go); anything that is not the API,
 * the generic sentence.
 */
export function commentFailure(error: unknown, kind: CommentSubjectKind): CommentFailure {
  if (!(error instanceof ApiError)) return { ...NONE, errors: { form: GENERIC_ERROR_DETAIL } }
  if (error.isFeatureDisabled()) {
    return { ...NONE, errors: {}, feature: { key: error.feature ?? 'blog', reason: error.detail } }
  }
  if (error.status === 429) {
    return { ...NONE, errors: { form: THROTTLED }, waitSeconds: error.retryAfter }
  }
  if (error.status === 403 && error.code === COMMENTS_CLOSED) {
    // The entry's own sentence (`detail` falls back to the envelope's generic `msg` without it).
    const entry = error.errors.find((item) => item.code === COMMENTS_CLOSED)
    const said = (entry ? entry.detail : error.detail).trim()
    return { ...NONE, errors: {}, closed: said || subjectRules(kind).closed }
  }
  if (error.status === 404) {
    return { ...NONE, errors: { form: subjectRules(kind).gone }, subjectGone: true }
  }
  const { errors, parentGone } = placeFieldErrors(error.fieldErrors(), COMMENT_FIELDS, error.detail)
  return { ...NONE, errors, parentGone, askName: Boolean(errors.name || errors.email) }
}
