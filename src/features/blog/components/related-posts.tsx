import type { PostCard } from '@/lib/api/types/blog'
import { RELATED_POSTS_ID } from '@/lib/html/reserved-ids'
import { PostGrid } from './post-grid'

/**
 * «مطالب مرتبط» (blog digest §1.5: `related_posts`, chosen on the server): post cards (their
 * links never prefetched: a post's page counts a view per render), one reading-list scope for
 * them all, each bookmark starting from the card's own `is_in_reading_list` (the post is read
 * per request as the visitor, its related posts with it). Nothing when there are none.
 */
export function RelatedPosts({
  posts,
  categoryLinks,
}: {
  posts: PostCard[]
  categoryLinks: ReadonlyMap<number, string>
}) {
  if (posts.length === 0) return null
  return (
    <section aria-labelledby={RELATED_POSTS_ID}>
      <h2
        id={RELATED_POSTS_ID}
        className="mb-3 text-lg leading-8 font-bold text-ink-900 md:mb-4 md:text-xl"
      >
        مطالب مرتبط
      </h2>
      <PostGrid
        posts={posts}
        categoryLinks={categoryLinks}
        label="مطالب مرتبط"
        priorityCount={0}
        ownFlags
      />
    </section>
  )
}
