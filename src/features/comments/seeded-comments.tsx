import { getFirstComments } from '@/features/comments/first-comments'
import type { CommentSubject } from '@/features/comments/subjects'
import { SubjectCommentList } from './subject-comment-list'

/**
 * A post's or a page's comments with page 1 rendered on the server (spec §8.13), from the
 * anonymous cached read `getFirstComments`. Render it in an in-page `<Suspense>` (fallback:
 * `<CommentPlaceholders>`) after the subject was awaited (R9). A failed read leaves the list to
 * load in the browser; with no comments nothing is read.
 */
export async function SeededComments({
  subject,
  count,
}: {
  subject: CommentSubject
  count: number
}) {
  const initialPage =
    count > 0 ? await getFirstComments(subject.kind, subject.slug, 'comment') : null
  return (
    <SubjectCommentList subject={subject} type="comment" count={count} initialPage={initialPage} />
  )
}
