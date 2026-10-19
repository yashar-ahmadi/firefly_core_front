import { cn } from '@/components/ui/cn'
import type { PostCard as PostCardData } from '@/lib/api/types/blog'
import { PostCard } from './post-card'
import { ReadingListScope } from './reading-list-scope'

const HEADING_ID = 'blog-featured'

/**
 * The featured posts of the blog home (`featured_posts`, 0 to 4; blog digest §1.3), laid out as
 * a magazine's front: nothing for none; the first one wide (picture beside the text from md),
 * the others as compact rows, two to a row under it on tablets, stacked beside it from lg (the
 * first then takes two thirds of the width; alone, all of it). Its picture loads first (LCP).
 */
export function BlogHero({
  posts,
  categoryLinks,
}: {
  posts: PostCardData[]
  categoryLinks: ReadonlyMap<number, string>
}) {
  const [first, ...rest] = posts.slice(0, 4)
  if (!first) return null
  return (
    <section aria-labelledby={HEADING_ID} className="mb-6 md:mb-8">
      <h2 id={HEADING_ID} className="sr-only">
        مطالب ویژه
      </h2>
      <ReadingListScope>
        <ul className="grid gap-3 md:gap-4 lg:grid-cols-3">
          <li className={cn('min-w-0', rest.length > 0 ? 'lg:col-span-2' : 'lg:col-span-3')}>
            <PostCard post={first} categoryLinks={categoryLinks} variant="wide" priority />
          </li>
          {rest.length > 0 && (
            <li className="min-w-0">
              <ul className="grid gap-3 sm:grid-cols-2 md:gap-4 lg:h-full lg:grid-cols-1 lg:content-start">
                {rest.map((post) => (
                  <li key={post.id} className="min-w-0">
                    <PostCard post={post} categoryLinks={categoryLinks} variant="feature" />
                  </li>
                ))}
              </ul>
            </li>
          )}
        </ul>
      </ReadingListScope>
    </section>
  )
}
