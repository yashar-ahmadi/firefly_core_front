'use client'

import { useQueryClient } from '@tanstack/react-query'
import { MessagesSquare, SearchX } from 'lucide-react'
import Link from 'next/link'
import { useRef } from 'react'
import { buttonClasses } from '@/components/ui/button-styles'
import { EmptyState } from '@/components/ui/empty-state'
import { Pagination } from '@/components/ui/pagination'
import { Skeleton } from '@/components/ui/skeleton'
import { VisuallyHidden } from '@/components/ui/visually-hidden'
import { formatNumber } from '@/lib/format'
import { useSummary } from '../dashboard/use-summary'
import { AccountPageHeader } from '../layout/account-page-header'
import { ListError } from '../lists/list-error'
import { usePageFallback } from '../lists/use-page-fallback'
import { useListUrl } from '../lists/use-list-url'
import { isLoadingSection } from '../use-account-query'
import { CommentFilters } from './comment-filters'
import { commentsSearch, parseCommentsParams } from './comment-params'
import { CommentRow } from './comment-row'
import { commentKey, commentsKey, fetchComments, useComments } from './comments-api'
import { LazyDeleteCommentDialog, preloadDeleteCommentDialog } from './lazy-dialog'
import { useCommentDelete } from './use-comment-delete'

export const COMMENTS_PATH = '/account/comments/'

function RowSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-3 rounded-card bg-white p-4 shadow-card md:p-5">
      <div className="flex items-start gap-3">
        <Skeleton className="size-14 shrink-0 rounded-control" />
        <div className="flex flex-1 flex-col gap-2 pt-1">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-5 w-3/5" />
        </div>
      </div>
      <Skeleton className="h-6 w-24 rounded-pill" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
    </div>
  )
}

function ListSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <VisuallyHidden role="status">در حال بارگذاری دیدگاه‌ها</VisuallyHidden>
      <RowSkeleton />
      <RowSkeleton />
      <RowSkeleton />
    </div>
  )
}

const EMPTY = 'rounded-card bg-white py-12 shadow-card'

/**
 * `/account/comments/` «دیدگاه‌های من» (digest §3.6): the visitor's comments on products, posts
 * and pages in every moderation state, newest first, filtered by subject and status in the URL
 * (`?type=post&status=pending&page=2`), with «حذف دیدگاه». Rows are keyed by subject type and id.
 * Skeletons while it loads (the page on screen stays while another loads, and a page emptied by
 * its deletes while it goes back one); «تلاش دوباره» when it cannot; a page past the end goes to
 * the last one.
 */
export function CommentsPage({ title }: { title: string }) {
  const url = useListUrl(COMMENTS_PATH, parseCommentsParams, commentsSearch)
  const { params } = url
  const client = useQueryClient()
  const query = useComments(params)
  const summary = useSummary()
  const heading = useRef<HTMLHeadingElement>(null)
  const goToPage = (page: number) => url.replace({ ...params, page })
  const leaving = usePageFallback({
    error: query.error,
    page: params.page,
    readFirst: () => {
      const first = { ...params, page: 1 }
      return client.fetchQuery({
        queryKey: commentsKey(first),
        queryFn: ({ signal }) => fetchComments(first, signal),
      })
    },
    goTo: goToPage,
  })
  const data = query.data
  const rows = data?.results ?? []
  const actions = useCommentDelete({ rows, params, pageHeading: heading, goToPage })
  const filtered = params.types.length > 0 || params.status !== null
  // A page after the first whose last row went is on its way to the page before (`goToPage`):
  // its skeletons under the filters, never an empty state (only page 1 can say there is none).
  const emptied = rows.length === 0 && params.page > 1
  const none =
    rows.length === 0 && params.page === 1 && (!filtered || summary.data?.comment_count === 0)

  let body
  if (query.isError && !data && !leaving && !isLoadingSection(query)) {
    body = (
      <ListError
        message="دیدگاه‌ها بارگذاری نشد."
        error={query.error}
        errorAt={query.errorUpdatedAt}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    )
  } else if (!data || leaving || emptied) {
    body = <ListSkeleton />
  } else if (none) {
    body = (
      <EmptyState
        icon={<MessagesSquare />}
        title="هنوز دیدگاهی ثبت نکرده‌اید"
        description="دیدگاه‌ها و پرسش‌هایی که درباره‌ی کالاها و مطالب می‌نویسید این‌جا می‌آیند."
        className={EMPTY}
      />
    )
  } else if (rows.length === 0) {
    body = (
      <EmptyState
        icon={<SearchX />}
        title="دیدگاهی با این فیلترها پیدا نشد"
        className={EMPTY}
        action={
          <Link
            href={COMMENTS_PATH}
            scroll={false}
            onClick={url.follow}
            className={buttonClasses({ variant: 'outline' })}
          >
            نمایش همه
          </Link>
        }
      />
    )
  } else {
    body = (
      <>
        <ul
          aria-label={title}
          aria-busy={query.isPlaceholderData || undefined}
          className="flex flex-col gap-4 transition-opacity aria-busy:opacity-60"
        >
          {rows.map((comment) => {
            const key = commentKey(comment)
            return (
              <li key={key}>
                <CommentRow
                  comment={comment}
                  pending={actions.pendingKey === key}
                  onDelete={() => actions.ask(comment)}
                  onPreloadDelete={preloadDeleteCommentDialog}
                />
              </li>
            )
          })}
        </ul>
        <Pagination
          page={data.current_page}
          totalPages={data.total_pages}
          hrefFor={(page) => url.href({ ...params, page })}
          onFollow={url.followPage}
          className="mt-6"
        />
      </>
    )
  }

  return (
    <>
      <AccountPageHeader title={title} headingRef={heading} />
      {/* Read out once a filter's list is in (the list itself changes silently). */}
      <VisuallyHidden role="status">
        {data && !query.isPlaceholderData ? `${formatNumber(data.count)} دیدگاه` : ''}
      </VisuallyHidden>
      {!(data && none) && <CommentFilters params={params} href={url.href} onFollow={url.follow} />}
      {body}
      {actions.deletion.requested && (
        <LazyDeleteCommentDialog
          comment={actions.deletion.comment}
          open={actions.deletion.open}
          onOpenChange={actions.onOpenChange}
          pending={actions.pendingKey !== null}
          failure={actions.deletion.failure}
          wait={actions.deletion.wait}
          onConfirm={actions.confirm}
          onCloseAutoFocus={actions.onCloseAutoFocus}
        />
      )}
    </>
  )
}
