'use client'

import { ChevronLeft, LogOut } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/components/ui/cn'
import { Spinner } from '@/components/ui/spinner'
import { useLogout } from '@/features/auth/use-logout'
import { useUnreadNotificationCount } from '@/features/notifications/unread'
import { useFeature } from '@/features/settings/feature-context'
import { useT } from '@/lib/i18n/i18n-context'
import { useSummary } from '../dashboard/use-summary'
import { ACCOUNT_HOME, ACCOUNT_NAV, isCurrentPage, navBadge, type NavBadge } from './nav-items'

export type AccountNavVariant = 'sidebar' | 'hub'

interface RowStyle {
  list: string
  row: string
  /** The icon, or its round tile on the hub. */
  icon: string
  logout: string
  logoutIcon: string
}

const STYLES: Record<AccountNavVariant, RowStyle> = {
  // 44px rows in the side column (lg); the current page tinted, with a bar at its start.
  sidebar: {
    list: 'flex flex-col gap-0.5',
    row: cn(
      'group relative flex min-h-11 items-center gap-3 rounded-control px-3 text-base text-ink-700 transition-colors',
      'hover:bg-ink-50 hover:text-ink-900',
      'aria-[current=page]:bg-brand-50 aria-[current=page]:font-bold aria-[current=page]:text-brand-800',
      "aria-[current=page]:before:absolute aria-[current=page]:before:inset-y-2 aria-[current=page]:before:start-0 aria-[current=page]:before:w-1 aria-[current=page]:before:rounded-pill aria-[current=page]:before:bg-brand aria-[current=page]:before:content-['']",
    ),
    icon: 'size-5 shrink-0 text-ink-500 group-aria-[current=page]:text-brand-700',
    logout: 'text-danger hover:bg-danger/5 hover:text-danger',
    logoutIcon: 'grid size-5 shrink-0 place-items-center [&_svg]:size-5',
  },
  // 56px rows on the phone's hub (the dashboard below lg): an icon tile, the label, the badge
  // and a chevron; rows ruled apart. The focus ring is drawn inside the row: the card around
  // the hub clips what is outside it (its rounded corners).
  hub: {
    list: 'flex flex-col divide-y divide-ink-100',
    row: cn(
      'group flex min-h-14 items-center gap-3 px-4 text-base font-medium text-ink-800 transition-colors',
      'hover:bg-ink-50 focus-visible:-outline-offset-2 active:bg-ink-100',
    ),
    icon: 'grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700 [&_svg]:size-5',
    logout: 'text-danger',
    logoutIcon: 'grid size-10 shrink-0 place-items-center rounded-full bg-danger/10 [&_svg]:size-5',
  },
}

/** A page's badge: a pill for a count, plain text for the balance; spoken after the label. */
function Badge({ badge }: { badge: NavBadge }) {
  return (
    <>
      <span
        aria-hidden
        className={cn(
          'ms-auto shrink-0',
          badge.kind === 'count'
            ? 'grid h-6 min-w-6 place-items-center rounded-pill bg-ink-100 px-2 text-sm leading-none font-bold text-ink-700 group-aria-[current=page]:bg-brand group-aria-[current=page]:text-brand-fg'
            : 'text-sm font-medium text-ink-600',
        )}
      >
        {badge.text}
      </span>
      <span className="sr-only">، {badge.label}</span>
    </>
  )
}

/**
 * The account area's navigation (`nav` «حساب کاربری»): the pages of the brief's table with
 * their badges (`useSummary`; the unread count the account shell keeps), the page on screen marked
 * `aria-current="page"`, and «خروج» last (`useLogout`, shared with the header menu). Rows of a
 * switched-off feature (the blog's reading list, the wallet) are left out. `sidebar`: the side
 * column from lg. `hub`: the dashboard's list of large rows below lg (without «پیشخوان»: it is
 * the page they are on).
 */
export function AccountNav({
  variant = 'sidebar',
  className,
}: {
  variant?: AccountNavVariant
  className?: string
}) {
  const t = useT()
  const pathname = usePathname() ?? ''
  const { data: summary } = useSummary()
  const unread = useUnreadNotificationCount()
  const switches = { blog: useFeature('blog').enabled, wallet: useFeature('wallet').enabled }
  const { logout, pending } = useLogout()
  const style = STYLES[variant]
  const hub = variant === 'hub'
  // The hub is the dashboard: its own row would link to the page on screen.
  const items = ACCOUNT_NAV.filter(
    (item) => (!item.feature || switches[item.feature]) && !(hub && item.href === ACCOUNT_HOME),
  )

  return (
    <nav aria-label={t('account_area')} className={className}>
      <ul className={style.list}>
        {items.map(({ key, href, label, icon: Icon }) => {
          const badge = navBadge(key, summary, unread)
          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={isCurrentPage(pathname, href) ? 'page' : undefined}
                className={style.row}
              >
                {hub ? (
                  <span aria-hidden className={style.icon}>
                    <Icon />
                  </span>
                ) : (
                  <Icon aria-hidden className={style.icon} />
                )}
                <span data-nav-label="" className="min-w-0 truncate">
                  {t(label)}
                </span>
                {badge && <Badge badge={badge} />}
                {hub && (
                  <ChevronLeft
                    aria-hidden
                    data-chevron=""
                    className={cn(
                      'size-5 shrink-0 text-ink-400 ltr:rotate-180',
                      !badge && 'ms-auto',
                    )}
                  />
                )}
              </Link>
            </li>
          )
        })}
        <li>
          <button
            type="button"
            aria-busy={pending || undefined}
            onClick={() => void logout()}
            className={cn(style.row, style.logout, 'w-full text-start')}
          >
            <span aria-hidden className={style.logoutIcon}>
              {pending ? <Spinner size="sm" /> : <LogOut className="rtl:-scale-x-100" />}
            </span>
            {t('logout')}
          </button>
        </li>
      </ul>
    </nav>
  )
}
