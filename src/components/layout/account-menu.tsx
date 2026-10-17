'use client'

import {
  Bell,
  Heart,
  LayoutDashboard,
  LogOut,
  MapPin,
  Package,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { Avatar } from '@/components/ui/avatar'
import { useFirstItemFocus, type DeferredMenuProps } from '@/components/ui/deferred-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/components/ui/cn'
import { SKELETON } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { profileAvatar, profileContact, profileName } from '@/features/auth/profile-display'
import { useLogout } from '@/features/auth/use-logout'
import { useMe } from '@/features/auth/use-me'
import { useHasUnreadNotifications } from '@/features/notifications/unread'
import { useT } from '@/lib/i18n/i18n-context'

interface AccountLink {
  href: string
  label: string
  icon: LucideIcon
  /** A dot, and words for it, while there is something new there. */
  unread?: boolean
}

/** A skeleton bar in a line box of the text's own height (`h-6` the name, `h-5` the contact). */
function SkeletonLine({ line, bar }: { line: string; bar: string }) {
  return (
    <span aria-hidden data-skeleton-line="" className={cn('flex items-center', line)}>
      <span className={cn(SKELETON, bar)} />
    </span>
  )
}

/**
 * Who is signed in: the avatar, the name and the email (or mobile). While the profile loads, a
 * skeleton line for each, as tall as the text that replaces it: the label does not grow.
 */
function Who() {
  const { data: me, isPending } = useMe()
  const contact = me ? profileContact(me) : null
  return (
    <DropdownMenuLabel className="flex items-center gap-3 px-3 py-2.5">
      <Avatar {...profileAvatar(me)} loading={isPending} size="md" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        {isPending ? (
          <>
            <SkeletonLine line="h-6" bar="h-4 w-28" />
            <SkeletonLine line="h-5" bar="h-3.5 w-40" />
          </>
        ) : (
          <>
            <span className="truncate text-base leading-6 font-bold text-ink-900">
              {me ? profileName(me) : null}
            </span>
            {contact && (
              // Left to right as a whole: a long email is cut at its end, never its start.
              <span
                dir="ltr"
                className="truncate text-right text-sm leading-5 font-normal text-ink-500"
              >
                {contact}
              </span>
            )}
          </>
        )}
      </span>
    </DropdownMenuLabel>
  )
}

/**
 * Signed in: the account menu (ruling P3-R2). Who is signed in, the account pages, then «خروج»
 * apart, after a separator. Loaded on first use by `AccountEntry` (see DeferredMenu), so it
 * starts open. «خروج» keeps the menu open, busy, while the logout runs; then the whole entry
 * gives way to the login link, which takes the focus, and the page goes home (`useLogout`).
 */
export function AccountMenu({ trigger, opening }: DeferredMenuProps) {
  const t = useT()
  const firstItemFocus = useFirstItemFocus(opening)
  const { logout, pending } = useLogout()
  const unread = useHasUnreadNotifications()
  const links: AccountLink[] = [
    { href: '/account/', label: t('account_dashboard'), icon: LayoutDashboard },
    { href: '/account/orders/', label: t('account_orders'), icon: Package },
    { href: '/account/wishlist/', label: t('account_wishlist'), icon: Heart },
    { href: '/account/addresses/', label: t('account_addresses'), icon: MapPin },
    { href: '/account/notifications/', label: t('account_notifications'), icon: Bell, unread },
  ]
  return (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent {...firstItemFocus} align="end" className="w-72">
        <Who />
        <DropdownMenuSeparator />
        {links.map(({ href, label, icon: Icon, unread: hasUnread }) => (
          <DropdownMenuItem key={href} asChild>
            <Link href={href}>
              <Icon aria-hidden />
              {label}
              {hasUnread && (
                <>
                  <span aria-hidden className="ms-auto size-2.5 rounded-full bg-brand" />
                  <span className="sr-only">، {t('notifications_unread')}</span>
                </>
              )}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="danger"
          aria-busy={pending || undefined}
          onSelect={(event) => {
            // Stays open, busy, until the session is gone (the entry then gives way).
            event.preventDefault()
            void logout()
          }}
        >
          {pending ? <Spinner size="sm" /> : <LogOut aria-hidden className="rtl:-scale-x-100" />}
          {t('logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
