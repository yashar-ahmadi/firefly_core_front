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
import { useFirstItemFocus, type DeferredMenuProps } from '@/components/ui/deferred-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { profileContact, profileName } from '@/features/auth/profile-display'
import { useLogout } from '@/features/auth/use-logout'
import { useMe } from '@/features/auth/use-me'
import { useHasUnreadNotifications } from '@/features/notifications/unread'
import { useT } from '@/lib/i18n/i18n-context'
import { AccountAvatar } from './account-avatar'

interface AccountLink {
  href: string
  label: string
  icon: LucideIcon
  /** A dot, and words for it, while there is something new there. */
  unread?: boolean
}

/** Who is signed in: the avatar, the name and the email (or mobile); a skeleton meanwhile. */
function Who() {
  const { data: me, isPending } = useMe()
  const contact = me ? profileContact(me) : null
  return (
    <DropdownMenuLabel className="flex items-center gap-3 px-3 py-2.5">
      <AccountAvatar profile={me} loading={isPending} className="size-10" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        {isPending ? (
          <Skeleton className="h-5 w-28" />
        ) : (
          <span className="truncate text-base font-bold text-ink-900">
            {me ? profileName(me) : null}
          </span>
        )}
        {contact && (
          <span className="truncate text-sm font-normal text-ink-500">
            <span dir="ltr">{contact}</span>
          </span>
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
