import { getFirstComments } from '@/features/catalog/api'
import type { CommentType } from '@/lib/api/types/catalog'
import { CommentList } from './comment-list'

export interface SeededCommentListProps {
  slug: string
  type: CommentType
  /** The product's count (`comment_count` / `question_count`): with 0 nothing is read. */
  count: number
}

/**
 * The reviews or questions with page 1 rendered on the server (spec §8.13), from the anonymous
 * cached read `getFirstComments`. Render it inside an in-page `<Suspense>` whose fallback is
 * `<CommentPlaceholders>`, after the product was awaited (R9). A failed read leaves the list to
 * load in the browser.
 */
export async function SeededCommentList({ slug, type, count }: SeededCommentListProps) {
  const initialPage = count > 0 ? await getFirstComments(slug, type) : null
  return <CommentList slug={slug} type={type} count={count} initialPage={initialPage} />
}
