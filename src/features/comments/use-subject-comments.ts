import { useInfiniteQuery } from '@tanstack/react-query'
import {
  commentListPath,
  subjectCommentsKey,
  type CommentSubject,
} from '@/features/comments/subjects'
import { bffFetch } from '@/lib/api/client'
import type { Paginated } from '@/lib/api/types/common'
import type { SubjectComment, SubjectCommentType } from '@/lib/api/types/subject-comment'

// A post's or a page's comment lists in the browser (blog digest §1.7, content digest §4.1),
// through the BFF: a signed-in visitor's own entries come marked (`is_current_user`), so the
// lists depend on who reads them and their keys are viewer-aware (VIEWER_AWARE_QUERIES: login
// and logout read them again).

export interface UseSubjectCommentsOptions {
  /** false until the list comes near the viewport (or its tab is opened): nothing is asked before. */
  enabled?: boolean
  /** Page 1 as the server rendered it (anonymous): seeds the list, no request. */
  initialPage?: Paginated<SubjectComment>
}

/**
 * The approved comments or questions of a subject as threads, page by page: an infinite query
 * over `<subject>/comment/list/?comment_type=…&page=…`. Pages count root threads; each brings
 * its whole visible subtree. A server-rendered `initialPage` is page 1: it never goes stale by
 * itself (refetch it explicitly); later pages come through the BFF.
 */
export function useSubjectComments(
  subject: CommentSubject,
  type: SubjectCommentType,
  { enabled = true, initialPage }: UseSubjectCommentsOptions = {},
) {
  return useInfiniteQuery({
    queryKey: [...subjectCommentsKey(subject), type],
    queryFn: async ({ pageParam, signal }) => {
      const { data } = await bffFetch<Paginated<SubjectComment>>(commentListPath(subject), {
        query: { comment_type: type, page: pageParam },
        signal,
      })
      return data
    },
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.current_page < last.total_pages ? last.current_page + 1 : undefined,
    enabled,
    ...(initialPage && {
      initialData: { pages: [initialPage], pageParams: [1] },
      staleTime: Infinity,
    }),
  })
}
