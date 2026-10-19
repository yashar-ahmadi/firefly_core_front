import {
  Bell,
  BookMarked,
  Heart,
  LayoutDashboard,
  MapPin,
  MessageSquarePlus,
  MessagesSquare,
  Package,
  UserRoundPen,
  WalletMinimal,
  type LucideIcon,
} from 'lucide-react'
import type { DashboardSummary } from '@/lib/api/types/dashboard'
import { toPersianDigits } from '@/lib/format/digits'
import { formatNumber, formatToman } from '@/lib/format/number'

// The account area's pages, in navigation order (brief table), and their badges. Pure.

export type AccountNavKey =
  | 'dashboard'
  | 'orders'
  | 'reviews'
  | 'wishlist'
  | 'reading_list'
  | 'comments'
  | 'addresses'
  | 'wallet'
  | 'notifications'
  | 'profile'

export interface AccountNavItem {
  key: AccountNavKey
  href: string
  /** The label's dictionary key. */
  label: string
  icon: LucideIcon
  /**
   * Listed only while this switch is on: the summary counts regardless (digest §0.6). The
   * wallet's row also while the visitor has something there (wallet-entry.ts), for viewing.
   */
  feature?: 'blog' | 'wallet'
}

export const ACCOUNT_HOME = '/account/'

export const ACCOUNT_NAV: readonly AccountNavItem[] = [
  { key: 'dashboard', href: ACCOUNT_HOME, label: 'account_dashboard', icon: LayoutDashboard },
  { key: 'orders', href: '/account/orders/', label: 'account_orders', icon: Package },
  { key: 'reviews', href: '/account/reviews/', label: 'account_reviews', icon: MessageSquarePlus },
  { key: 'wishlist', href: '/account/wishlist/', label: 'account_wishlist', icon: Heart },
  {
    key: 'reading_list',
    href: '/account/reading-list/',
    label: 'account_reading_list',
    icon: BookMarked,
    feature: 'blog',
  },
  { key: 'comments', href: '/account/comments/', label: 'account_comments', icon: MessagesSquare },
  { key: 'addresses', href: '/account/addresses/', label: 'account_addresses', icon: MapPin },
  {
    key: 'wallet',
    href: '/account/wallet/',
    label: 'account_wallet',
    icon: WalletMinimal,
    feature: 'wallet',
  },
  {
    key: 'notifications',
    href: '/account/notifications/',
    label: 'account_notifications',
    icon: Bell,
  },
  { key: 'profile', href: '/account/profile/', label: 'account_profile', icon: UserRoundPen },
]

/** A badge: what it shows, and the words a screen reader says after the page's name. */
export interface NavBadge {
  text: string
  label: string
  /** The wallet's balance (a value, plain text), not a count (a pill). */
  kind: 'count' | 'amount'
}

/** What each counted badge counts, after its number («۷ سفارش»). */
const COUNT_NOUN: Partial<Record<AccountNavKey, string>> = {
  orders: 'سفارش',
  reviews: 'کالا',
  wishlist: 'کالا',
  reading_list: 'مطلب',
  comments: 'دیدگاه',
  notifications: 'اعلان خوانده‌نشده',
}

/** The summary's count of a page's list. */
function countOf(key: AccountNavKey, summary: DashboardSummary): number | undefined {
  switch (key) {
    case 'orders':
      return summary.orders.total
    case 'reviews':
      return summary.awaiting_review_count
    case 'wishlist':
      return summary.wishlist_count
    case 'reading_list':
      return summary.reading_list_count
    case 'comments':
      return summary.comment_count
    default:
      return undefined
  }
}

/**
 * The badge of a page: its list's count from the summary (never computed here), the unread
 * count of the inbox, the wallet's balance in Toman (said to be for viewing while the wallet is
 * switched off: `viewOnly`). None for an empty list, nor before the summary is in (the unread
 * count does not wait for it).
 */
export function navBadge(
  key: AccountNavKey,
  summary: DashboardSummary | undefined,
  unread: number | undefined,
  { viewOnly = false }: { viewOnly?: boolean } = {},
): NavBadge | null {
  if (key === 'wallet') {
    if (!summary) return null
    const balance = formatToman(summary.wallet.balance)
    const label = `موجودی ${balance}${viewOnly ? '، فقط برای مشاهده' : ''}`
    return { text: balance, label, kind: 'amount' }
  }
  const noun = COUNT_NOUN[key]
  const count = key === 'notifications' ? unread : summary ? countOf(key, summary) : undefined
  if (!noun || count === undefined || count <= 0) return null
  return {
    text: toPersianDigits(count > 99 ? '99+' : count),
    label: `${formatNumber(count)} ${noun}`,
    kind: 'count',
  }
}

/** Whether `href` is the page on screen, or the section it is in (not the dashboard's). */
export function isCurrentPage(pathname: string, href: string): boolean {
  return href === ACCOUNT_HOME ? pathname === href : pathname.startsWith(href)
}
