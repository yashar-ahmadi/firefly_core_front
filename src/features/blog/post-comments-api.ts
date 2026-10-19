import { useInfiniteQuery } from '@tanstack/react-query'
import { bffFetch } from '@/lib/api/client'
import type { BlogComment, BlogCommentType } from '@/lib/api/types/blog-post'
import type { Paginated } from '@/lib/api/types/common'

// A blog post's comment lists in the browser (blog digest §1.7), through the BFF: a signed-in
// visitor's own entries come marked (`is_current_user`), so the lists depend on who reads them
// and their keys are viewer-aware (VIEWER_AWARE_QUERIES: login and logout read them again).

/** Every blog post's comment lists. */
export const POST_COMMENTS_KEY = ['blog-comments'] as const

/** Both lists of one post, e.g. to read them again after a stale reply target. */
export const postCommentsKey = (slug: string) => [...POST_COMMENTS_KEY, slug] as const

export interface UsePostCommentsOptions {
  /** false until the list comes near the viewport (or its tab is opened): nothing is asked before. */
  enabled?: boolean
  /** Page 1 as the server rendered it (anonymous): seeds the list, no request. */
  initialPage?: Paginated<BlogComment>
}

/**
 * The approved comments or questions of a post as threads, page by page: an infinite query over
 * `blog/post/<slug>/comment/list/?comment_type=…&page=…`. Pages count root threads; each brings
 * its whole visible subtree. A server-rendered `initialPage` is page 1: it never goes stale by
 * itself (refetch it explicitly); later pages come through the BFF.
 */
export function usePostComments(
  slug: string,
  type: BlogCommentType,
  { enabled = true, initialPage }: UsePostCommentsOptions = {},
) {
  return useInfiniteQuery({
    queryKey: [...postCommentsKey(slug), type],
    queryFn: async ({ pageParam, signal }) => {
      const { data } = await bffFetch<Paginated<BlogComment>>(`blog/post/${slug}/comment/list/`, {
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
