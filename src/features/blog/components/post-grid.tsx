import { FileSearch } from 'lucide-react'
import type { ReactNode } from 'react'
import { EmptyState } from '@/components/ui/empty-state'
import type { PostCard as PostCardData } from '@/lib/api/types/blog'
import { PostCard } from './post-card'
import { ReadingListScope } from './reading-list-scope'

/** The cards in the first phone rows get their pictures first: they are the likely LCP. */
const PRIORITY_COUNT = 2

export interface PostGridProps {
  posts: PostCardData[]
  categoryLinks: ReadonlyMap<number, string>
  /** Names the list (the page it holds). */
  label?: string
  /** Shown instead of the grid when `posts` is empty. */
  emptyState?: ReactNode
  /** How many leading cards load their picture eagerly; 0 below the fold. */
  priorityCount?: number
}

/**
 * Post cards in a responsive grid (one column of row cards on phones, tiles: 2 from sm, 3 from
 * xl beside the sidebar), or an empty state. One reading-list scope for the whole grid.
 */
export function PostGrid({
  posts,
  categoryLinks,
  label,
  emptyState,
  priorityCount = PRIORITY_COUNT,
}: PostGridProps) {
  if (posts.length === 0) {
    return emptyState ?? <EmptyState icon={<FileSearch />} title="مطلبی پیدا نشد" />
  }
  return (
    <ReadingListScope>
      <ul aria-label={label} className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
        {posts.map((post, index) => (
          <li key={post.id} className="min-w-0">
            <PostCard post={post} categoryLinks={categoryLinks} priority={index < priorityCount} />
          </li>
        ))}
      </ul>
    </ReadingListScope>
  )
}
