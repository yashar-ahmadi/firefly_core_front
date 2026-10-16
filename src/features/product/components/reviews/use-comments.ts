import { useInfiniteQuery } from '@tanstack/react-query'
import { bffFetch } from '@/lib/api/client'
import type { CommentType, ProductComment } from '@/lib/api/types/catalog'
import type { Paginated } from '@/lib/api/types/common'

/** Every comment list of a product (both types), e.g. to refresh after a stale reply target. */
export const commentsKey = (slug: string) => ['product', slug, 'comments'] as const

export interface UseCommentsOptions {
  /** false until the section comes into view: nothing is requested before. */
  enabled?: boolean
  /** The first page as the server rendered it (anonymous): seeds the list, no request. */
  initialPage?: Paginated<ProductComment>
}

/**
 * The approved reviews or questions of a product as threads (product digest §3.12), page by
 * page: an infinite query over `product/detail/<slug>/comment/list/?comment_type=…&page=…`.
 * Pages count root threads; replies come nested. Through the BFF, so a signed-in viewer's own
 * entries are marked (`is_current_user`). A server-rendered `initialPage` is page 1: it never
 * goes stale by itself (refetch it explicitly), and later pages still come through the BFF.
 */
export function useComments(
  slug: string,
  type: CommentType,
  { enabled = true, initialPage }: UseCommentsOptions = {},
) {
  return useInfiniteQuery({
    queryKey: [...commentsKey(slug), type],
    queryFn: async ({ pageParam, signal }) => {
      const { data } = await bffFetch<Paginated<ProductComment>>(
        `product/detail/${slug}/comment/list/`,
        { query: { comment_type: type, page: pageParam }, signal },
      )
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
