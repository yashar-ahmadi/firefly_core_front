'use client'

import { ChevronLeft, Heart, Lock, MessageSquarePlus, WalletMinimal } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/components/ui/cn'
import { Skeleton } from '@/components/ui/skeleton'
import { useFeature } from '@/features/settings/feature-context'
import type { DashboardSummary } from '@/lib/api/types/dashboard'
import { formatNumber, formatToman } from '@/lib/format/number'
import { isLoadingSection } from '../use-account-query'
import { SectionError } from './section-error'
import { useSummary } from './use-summary'

/** The wallet: a wide card (icon at the start); the counters: narrow ones (icon on top). */
type CardShape = 'wide' | 'narrow'

interface CardContent {
  key: string
  href: string
  label: string
  icon: ReactNode
  /** The icon tile's colours. */
  tone: string
  amount: string
  unit: string
  note: string
  /** The note is a warning (a frozen wallet). */
  warning?: boolean
  shape: CardShape
}

const BOX = 'relative flex h-full rounded-card bg-white p-4 shadow-card'
const SHAPE: Record<CardShape, string> = {
  wide: 'col-span-2 items-center gap-3',
  narrow: 'flex-col gap-2',
}
const TILE = 'grid size-11 shrink-0 place-items-center rounded-full [&_svg]:size-5'

/** Three lines of fixed height under (or beside) the tile: label 24px, amount 32px, note 24px. */
function Lines({ children }: { children: ReactNode }) {
  return <span className="flex min-w-0 flex-1 flex-col">{children}</span>
}

function SummaryCard({ card }: { card: CardContent }) {
  const chevron = (
    <ChevronLeft aria-hidden className="size-5 shrink-0 text-ink-400 ltr:rotate-180" />
  )
  const tile = (
    <span aria-hidden className={cn(TILE, card.tone)}>
      {card.icon}
    </span>
  )
  return (
    <Link
      href={card.href}
      data-card=""
      className={cn(
        BOX,
        SHAPE[card.shape],
        'group transition-[box-shadow,transform] duration-200 ease-out hover:shadow-raised motion-safe:hover:-translate-y-0.5',
      )}
    >
      {card.shape === 'narrow' ? (
        <span className="flex items-center justify-between">
          {tile}
          {chevron}
        </span>
      ) : (
        tile
      )}
      <Lines>
        <span className="truncate text-sm leading-6 text-ink-600">{card.label}</span>
        <span className="truncate text-xl leading-8 font-bold text-ink-900">
          {card.amount} <span className="text-sm font-medium text-ink-600">{card.unit}</span>
        </span>
        <span
          className={cn(
            'flex min-w-0 items-center gap-1 text-sm leading-6',
            card.warning ? 'font-medium text-warning' : 'text-ink-500',
          )}
        >
          {card.warning && <Lock aria-hidden className="size-4 shrink-0" />}
          <span className="truncate">{card.note}</span>
        </span>
      </Lines>
      {card.shape === 'wide' && chevron}
    </Link>
  )
}

/** A card's skeleton: the same box, tile and line heights. */
function CardSkeleton({ shape }: { shape: CardShape }) {
  const tile = <Skeleton className="size-11 rounded-full" />
  return (
    <div data-card="" aria-hidden className={cn(BOX, SHAPE[shape])}>
      {shape === 'narrow' ? <span className="flex h-11 items-center">{tile}</span> : tile}
      <Lines>
        <span className="flex h-6 items-center">
          <Skeleton className="h-3.5 w-20" />
        </span>
        <span className="flex h-8 items-center">
          <Skeleton className="h-5 w-28" />
        </span>
        <span className="flex h-6 items-center">
          <Skeleton className="h-3.5 w-24" />
        </span>
      </Lines>
    </div>
  )
}

function cards(summary: DashboardSummary, withWallet: boolean): CardContent[] {
  const { wallet, awaiting_review_count: reviews, wishlist_count: wishlist } = summary
  const list: CardContent[] = [
    {
      key: 'reviews',
      href: '/account/reviews/',
      label: 'در انتظار دیدگاه',
      icon: <MessageSquarePlus />,
      tone: 'bg-accent-50 text-accent-900',
      amount: formatNumber(reviews),
      unit: 'کالا',
      note: reviews > 0 ? 'منتظر دیدگاه شما' : 'موردی در انتظار نیست',
      shape: 'narrow',
    },
    {
      key: 'wishlist',
      href: '/account/wishlist/',
      label: 'علاقه‌مندی‌ها',
      icon: <Heart />,
      tone: 'bg-sale/10 text-sale',
      amount: formatNumber(wishlist),
      unit: 'کالا',
      note: wishlist > 0 ? 'در فهرست پسندیده‌ها' : 'هنوز خالی است',
      shape: 'narrow',
    },
  ]
  if (!withWallet) return list
  return [
    {
      key: 'wallet',
      href: '/account/wallet/',
      label: 'کیف پول',
      icon: <WalletMinimal />,
      tone: 'bg-brand-50 text-brand-700',
      amount: formatToman(wallet.balance, { suffix: false }),
      unit: 'تومان',
      note: wallet.is_frozen ? 'کیف پول شما موقتاً مسدود است' : 'قابل استفاده در خرید',
      warning: wallet.is_frozen,
      shape: 'wide',
    },
    ...list,
  ]
}

/**
 * The dashboard's counters (`useSummary`): the wallet's balance in Toman (with a note while it
 * is frozen; left out while the wallet switch is off), the purchases awaiting a review and the
 * wishlist, each a link to its page. Phones: the wallet across, the two counters side by side;
 * from md one row. Skeletons hold the same boxes while the summary loads; a failed read offers
 * «تلاش دوباره».
 */
export function SummaryCards() {
  const query = useSummary()
  const withWallet = useFeature('wallet').enabled
  const loading = isLoadingSection(query)
  const grid = cn('grid grid-cols-2 gap-3 md:gap-4', withWallet && 'md:grid-cols-4')

  // Only without data: a later read that fails leaves the cards as they were.
  if (!loading && !query.data) {
    return (
      <SectionError
        message={'خلاصه\u{0654} حساب بارگذاری نشد.'}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
        className="min-h-28 rounded-card bg-white shadow-card"
      />
    )
  }
  return (
    <div data-testid="summary-cards" aria-busy={loading || undefined} className={grid}>
      {!query.data ? (
        <>
          {withWallet && <CardSkeleton shape="wide" />}
          <CardSkeleton shape="narrow" />
          <CardSkeleton shape="narrow" />
        </>
      ) : (
        cards(query.data, withWallet).map((card) => <SummaryCard key={card.key} card={card} />)
      )}
    </div>
  )
}
