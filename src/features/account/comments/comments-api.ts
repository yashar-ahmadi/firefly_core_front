import { keepPreviousData, type QueryKey, type UseQueryResult } from '@tanstack/react-query'
import { bffFetch } from '@/lib/api/client'
import type { Paginated } from '@/lib/api/types/common'
import type { MyComment } from '@/lib/api/types/dashboard'
import { MY_COMMENTS_KEY } from '@/lib/session/viewer-queries'
import { useAccountQuery } from '../use-account-query'
import { commentsApiQuery, type CommentsParams } from './comment-params'

// «دیدگاه‌های من» through the BFF (digest §3.6), with the session only.

export type CommentsPage = Paginated<MyComment>

/** A row's key: ids are unique only within a subject type (three of sara's share 10001). */
export const commentKey = (comment: Pick<MyComment, 'subject_type' | 'id'>) =>
  `${comment.subject_type}:${comment.id}`

/** One page of the list for these filters (under `['dashboard']`: logout removes it). */
export function commentsKey({ types, status, page }: CommentsParams): QueryKey {
  return [...MY_COMMENTS_KEY, { types, status, page }]
}

export async function fetchComments(
  params: CommentsParams,
  signal?: AbortSignal,
): Promise<CommentsPage> {
  const query = commentsApiQuery(params)
  return (await bffFetch<CommentsPage>('dashboard/comment/list/', { query, signal })).data
}

/** The list for the URL's filters; the page on screen stays while the next one loads. */
export function useComments(params: CommentsParams): UseQueryResult<CommentsPage> {
  return useAccountQuery({
    queryKey: commentsKey(params),
    queryFn: ({ signal }) => fetchComments(params, signal),
    placeholderData: keepPreviousData,
  })
}

/**
 * `DELETE dashboard/comment/<subject_type>/<id>/delete/`: withdraws the comment in any state
 * (feature switches aside). 204 with no body; 404 when it is not the visitor's or gone already.
 */
export async function withdrawComment(comment: Pick<MyComment, 'subject_type' | 'id'>) {
  await bffFetch<null>(`dashboard/comment/${comment.subject_type}/${comment.id}/delete/`, {
    method: 'DELETE',
  })
}
