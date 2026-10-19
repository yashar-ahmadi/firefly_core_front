import { getFirstPostComments } from '@/features/blog/post-api'
import { PostCommentList } from './post-comment-list'

/**
 * A post's comments with page 1 rendered on the server (spec §8.13), from the anonymous cached
 * read `getFirstPostComments`. Render it in an in-page `<Suspense>` (fallback:
 * `<PostCommentPlaceholders>`) after the post was awaited (R9). A failed read leaves the list to
 * load in the browser; with no comments nothing is read.
 */
export async function SeededPostComments({ slug, count }: { slug: string; count: number }) {
  const initialPage = count > 0 ? await getFirstPostComments(slug, 'comment') : null
  return <PostCommentList slug={slug} type="comment" count={count} initialPage={initialPage} />
}
