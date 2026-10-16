import 'server-only'
import { cache } from 'react'
import { CATALOG_TAG, oneSegment, read } from '@/features/catalog/loaders/read'
import { ApiError } from '@/lib/api/errors'
import type { CommentType, ProductComment } from '@/lib/api/types/catalog'
import type { Paginated } from '@/lib/api/types/common'

// The first page of a product's reviews or questions, for the server-rendered HTML (spec §8.13:
// indexable content is in the HTML). Later pages load in the browser through the BFF.

const COMMENTS_REVALIDATE = 60

/**
 * `GET product/detail/<slug>/comment/list/?comment_type=<type>&page=1`: anonymous (no token, no
 * visitor IP, so `is_current_user` is false everywhere), cached 60 s under `product:<slug>` like
 * the product itself. Never throws: null on any failure (logged once), and the list then loads in
 * the browser as before.
 */
export const getFirstComments = cache(
  async (slug: string, type: CommentType): Promise<Paginated<ProductComment> | null> => {
    const segment = oneSegment(slug)
    if (segment === null) return null
    try {
      return await read<Paginated<ProductComment>>(`product/detail/${segment.path}/comment/list`, {
        query: { comment_type: type, page: 1 },
        revalidate: COMMENTS_REVALIDATE,
        tags: [`product:${segment.text}`, CATALOG_TAG],
      })
    } catch (error) {
      const reason = error instanceof ApiError ? `${error.status} ${error.code}` : String(error)
      console.error(`[catalog] getFirstComments(${type}) failed:`, reason)
      return null
    }
  },
)
