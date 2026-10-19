import { BookMarked, BookX, FileSearch, Newspaper } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { buttonClasses } from '@/components/ui/button-styles'
import { EmptyState } from '@/components/ui/empty-state'
import { BLOG_UNAVAILABLE_TITLE } from '@/features/blog/blog-copy'
import { BLOG_PATH } from '@/features/blog/blog-routes'
import { BlogOffReason, ClearReadingListFilters } from './reading-list-actions'

const FRAME = 'rounded-card bg-white py-12 shadow-card'

/** What the reading list page says when it has no posts to show. */
export interface ReadingListStates {
  /** Nothing saved: the way to the blog. */
  empty: ReactNode
  /** Nothing for the search or category: a button that clears them. */
  noMatch: ReactNode
  /** The blog switched off (the API refuses the list): the operator's reason. */
  unavailable: ReactNode
}

/**
 * The reading list page's states, rendered by its server page and passed to the client page, so
 * `EmptyState` and its icons never ship to the browser with it (they regrouped the catalog's
 * shared chunks when they did: docs/ARCHITECTURE.md, Performance, «The blog post page and the
 * reading list»). Their buttons are small client leaves.
 */
export function readingListStates(): ReadingListStates {
  return {
    empty: (
      <EmptyState
        icon={<BookMarked />}
        title="هنوز مطلبی در لیست مطالعه ندارید"
        description={
          'با زدن نشانک روی هر مطلب وبلاگ، آن را این\u{200C}جا نگه دارید تا بعداً بخوانید.'
        }
        className={FRAME}
        action={
          <Link href={BLOG_PATH} className={buttonClasses({ variant: 'outline' })}>
            <Newspaper aria-hidden />
            رفتن به وبلاگ
          </Link>
        }
      />
    ),
    noMatch: (
      <EmptyState
        icon={<FileSearch />}
        title="مطلبی با این جستجو پیدا نشد"
        description={'جستجو یا دسته\u{200C}بندی دیگری را امتحان کنید.'}
        className={FRAME}
        action={<ClearReadingListFilters />}
      />
    ),
    unavailable: (
      <EmptyState
        icon={<BookX />}
        title={BLOG_UNAVAILABLE_TITLE}
        description={<BlogOffReason />}
        className={FRAME}
      />
    ),
  }
}
