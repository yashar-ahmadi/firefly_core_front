'use client'

import { FileSearch, Package } from 'lucide-react'
import Link from 'next/link'
import type { MouseEvent } from 'react'
import { buttonClasses } from '@/components/ui/button-styles'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { VisuallyHidden } from '@/components/ui/visually-hidden'

// «سفارش‌های من» while its list loads (cards of the same shape), and with nothing to show: no
// order yet (the way to the shop), none in this tab (the tab named as the API labels it, the
// way to every order), none for this search (the way to clear it).

function CardSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-3 rounded-card bg-white p-4 shadow-card md:p-5">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-7 w-24 rounded-pill" />
      </div>
      <Skeleton className="h-4 w-32" />
      <div className="flex gap-2">
        <Skeleton className="size-12 rounded-control" />
        <Skeleton className="size-12 rounded-control" />
      </div>
      <Skeleton className="h-1.5 w-full rounded-full" />
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-11 w-32 rounded-control" />
    </div>
  )
}

export function OrdersSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <VisuallyHidden role="status">در حال بارگذاری سفارش‌ها</VisuallyHidden>
      <CardSkeleton />
      <CardSkeleton />
    </div>
  )
}

const EMPTY = 'rounded-card bg-white py-12 shadow-card'

export interface OrdersEmptyProps {
  searching: boolean
  /** The tab's label (the API's), or null for every order. */
  group: string | null
  allHref: string
  clearHref: string
  onFollow: (event: MouseEvent<HTMLAnchorElement>) => void
}

export function OrdersEmpty({ searching, group, allHref, clearHref, onFollow }: OrdersEmptyProps) {
  const outline = buttonClasses({ variant: 'outline' })
  if (searching) {
    return (
      <EmptyState
        icon={<FileSearch />}
        title="سفارشی با این جستجو پیدا نشد"
        description="کد سفارش، کد رهگیری مرسوله یا بخشی از نام کالا را جستجو کنید."
        className={EMPTY}
        action={
          <Link href={clearHref} scroll={false} onClick={onFollow} className={outline}>
            پاک کردن جستجو
          </Link>
        }
      />
    )
  }
  if (group !== null) {
    return (
      <EmptyState
        icon={<Package />}
        title={`سفارشی در «${group}» ندارید`}
        className={EMPTY}
        action={
          <Link href={allHref} scroll={false} onClick={onFollow} className={outline}>
            {'همه\u{0654} سفارش‌ها'}
          </Link>
        }
      />
    )
  }
  return (
    <EmptyState
      icon={<Package />}
      title="هنوز سفارشی ثبت نکرده‌اید"
      description="سفارش‌هایی که ثبت می‌کنید با وضعیت و جزئیاتشان این‌جا می‌آیند."
      className={EMPTY}
      action={
        <Link href="/" className={buttonClasses()}>
          شروع خرید
        </Link>
      }
    />
  )
}
