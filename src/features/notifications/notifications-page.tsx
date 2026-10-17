'use client'

import { Bell, ChevronDown, RefreshCw } from 'lucide-react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { VisuallyHidden } from '@/components/ui/visually-hidden'
import { AccountPageHeader } from '@/features/account/layout/account-page-header'
import { ListError } from '@/features/account/lists/list-error'
import { isLoadingSection } from '@/features/account/use-account-query'
import type { NotificationItem as Notification } from '@/lib/api/types/notification'
import { useOptionalStoreConfig } from '@/lib/config-context'
import { formatNumber } from '@/lib/format'
import { isApiNotFound } from '@/lib/api/errors'
import { MarkAllButton, MarkAllStatus } from './mark-all-button'
import { NotificationItem } from './notification-item'
import type { NotificationsPage as Page } from './notifications-api'
import { useInboxRefresh } from './use-inbox-refresh'
import { useMarkAll } from './use-mark-all'
import { useMarkRead } from './use-mark-read'
import { useNotifications, useUnreadCount } from './use-notifications'

// The switch's code (and so web push's) loads only for a shop that has web push, and only in the
// browser: it reads the browser's permission. Firebase itself comes later still, on demand.
const PushToggle = dynamic(
  () =>
    import('@/features/push/push-toggle')
      .then((module) => module.PushToggle)
      .catch(() => () => null),
  { ssr: false, loading: () => <Skeleton className="mb-4 h-20 rounded-card md:mb-5" /> },
)

function RowSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-2 rounded-card bg-white p-4 shadow-card md:p-5">
      <Skeleton className="h-5 w-3/5" />
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-4 w-full" />
    </div>
  )
}

/** Every row once, in the pages' order (a new notification shifts the pages under «نمایش بیشتر»). */
function rowsOf(pages: Page[] | undefined): Notification[] {
  const seen = new Set<number>()
  return (pages ?? []).flatMap((page) =>
    page.results.filter((row) => !seen.has(row.id) && seen.add(row.id)),
  )
}

/** «۲ اعلان خوانده‌نشده», read out as it changes. */
function unreadText(count: number | undefined): string {
  if (count === undefined) return ''
  return count === 0 ? 'همهٔ اعلان‌ها خوانده شده است.' : `${formatNumber(count)} اعلان خوانده‌نشده`
}

/**
 * `/account/notifications/` «اعلان‌ها» (digest §4): the inbox, newest first, 20 at a time with
 * «نمایش بیشتر». Opening an unread one marks it read; «علامت‌گذاری همه به‌عنوان خوانده‌شده» goes
 * through every unread one. The unread count (the account navigation's badge) is read here, and
 * again every 5 minutes while the tab is in view. With web push, its switch is at the top.
 */
export function NotificationsPage({ title }: { title: string }) {
  const config = useOptionalStoreConfig()
  const query = useNotifications()
  const unread = useUnreadCount()
  const markRead = useMarkRead()
  const markAll = useMarkAll()
  useInboxRefresh()
  const rows = rowsOf(query.data?.pages)

  let body
  if (query.isError && !query.data && !isLoadingSection(query)) {
    body = (
      <ListError
        message="اعلان‌ها بارگذاری نشد."
        error={query.error}
        errorAt={query.errorUpdatedAt}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    )
  } else if (!query.data) {
    body = (
      <div aria-busy="true" className="flex flex-col gap-3">
        <VisuallyHidden role="status">در حال بارگذاری اعلان‌ها</VisuallyHidden>
        <RowSkeleton />
        <RowSkeleton />
        <RowSkeleton />
      </div>
    )
  } else if (rows.length === 0) {
    body = (
      <EmptyState
        icon={<Bell />}
        title="اعلانی ندارید"
        description="پیام‌های فروشگاه، مثل خبر سفارش‌ها و جشنواره‌ها، این‌جا می‌آیند."
        className="rounded-card bg-white py-12 shadow-card"
      />
    )
  } else {
    const nextFailed = query.isFetchNextPageError
    body = (
      <>
        <ul aria-label={title} className="flex flex-col gap-3">
          {rows.map((item) => (
            <li key={item.id}>
              <NotificationItem item={item} onOpen={markRead} />
            </li>
          ))}
        </ul>
        {query.hasNextPage && (
          <div className="mt-5 flex flex-col items-center gap-2">
            {nextFailed && <p className="text-base text-danger">ادامهٔ اعلان‌ها بارگذاری نشد.</p>}
            <Button
              variant="outline"
              aria-busy={query.isFetchingNextPage || undefined}
              iconStart={
                query.isFetchingNextPage ? (
                  <Spinner size="sm" />
                ) : nextFailed ? (
                  <RefreshCw aria-hidden />
                ) : (
                  <ChevronDown aria-hidden />
                )
              }
              onClick={() => {
                if (query.isFetchingNextPage) return
                // A 404: the list shrank under the next page; read it all again.
                if (nextFailed && isApiNotFound(query.error)) void query.refetch()
                else void query.fetchNextPage()
              }}
            >
              {nextFailed ? 'تلاش دوباره' : 'نمایش بیشتر'}
            </Button>
          </div>
        )}
      </>
    )
  }

  return (
    <>
      <AccountPageHeader
        title={title}
        action={
          <MarkAllButton state={markAll.state} unread={unread.data} onStart={markAll.start} />
        }
      />
      <div className="mb-4 flex flex-col gap-1 md:mb-5">
        <p role="status" className="text-base text-ink-700">
          {/* An empty inbox says so itself. */}
          {query.data && rows.length === 0 ? '' : unreadText(unread.data)}
        </p>
        <MarkAllStatus state={markAll.state} />
      </div>
      {config?.features.webPush && config.firebase && <PushToggle />}
      {body}
    </>
  )
}
