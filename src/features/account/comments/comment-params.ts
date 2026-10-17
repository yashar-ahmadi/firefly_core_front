import type { QueryInit } from '@/lib/api/envelope'
import type { CommentStatus, CommentSubjectType } from '@/lib/api/types/dashboard'
import { pageEntry, parsePage, toSearch } from '../lists/page-param'

// «دیدگاه‌های من»'s URL state (`?type=post&status=pending&page=2`, defaults left out) and the API
// query it makes (digest §3.6). Pure.

/** The subject tabs after «همه», in order (`subject_type`). */
export const SUBJECT_TYPES: readonly { value: CommentSubjectType; label: string }[] = [
  { value: 'product', label: 'محصولات' },
  { value: 'post', label: 'مطالب وبلاگ' },
  { value: 'page', label: 'صفحات' },
]

/** The status chips after «همه», in order (`status`; `approved` and the like are a 400). */
export const COMMENT_STATUSES: readonly { value: CommentStatus; label: string }[] = [
  { value: 'pending', label: 'در انتظار تأیید' },
  { value: 'accepted', label: 'تأیید شده' },
  { value: 'declined', label: 'رد شده' },
]

export interface CommentsParams {
  /** In tab order, without repeats; empty for «همه» (none sent). */
  types: CommentSubjectType[]
  /** null for «همه». */
  status: CommentStatus | null
  page: number
}

type Search = Pick<URLSearchParams, 'get' | 'getAll'>

/**
 * The URL's state. `type` may repeat (several types); a value the API would refuse (an unknown
 * type, a comma-joined list, an unknown status) is dropped, never sent.
 */
export function parseCommentsParams(search: Search): CommentsParams {
  const asked = new Set(search.getAll('type'))
  const status = COMMENT_STATUSES.find((option) => option.value === search.get('status'))
  return {
    types: SUBJECT_TYPES.filter((type) => asked.has(type.value)).map((type) => type.value),
    status: status?.value ?? null,
    page: parsePage(search.get('page')),
  }
}

/** The URL's query for `params`: `?type=…&status=…&page=…`, defaults left out. */
export function commentsSearch({ types, status, page }: CommentsParams): string {
  return toSearch([
    ...types.map((type): [string, string] => ['type', type]),
    ...(status ? [['status', status] as [string, string]] : []),
    ...pageEntry(page),
  ])
}

/**
 * `GET dashboard/comment/list/`'s query: `subject_type` as an array, which the API client sends
 * as the same parameter repeated (never comma-joined: that is a 400); nothing for «همه».
 */
export function commentsApiQuery({ types, status, page }: CommentsParams): QueryInit {
  return {
    ...(types.length > 0 ? { subject_type: types } : {}),
    ...(status ? { status } : {}),
    ...(page > 1 ? { page } : {}),
  }
}
