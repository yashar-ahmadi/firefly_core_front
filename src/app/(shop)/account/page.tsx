import type { Metadata } from 'next'
import { Suspense } from 'react'
import { DashboardGreeting } from '@/features/account/dashboard/greeting'
import { BannersSkeleton, LiveBanners } from '@/features/account/dashboard/live-banners'
import { OrderStatusStrip } from '@/features/account/dashboard/order-status-strip'
import { RecentPurchases } from '@/features/account/dashboard/recent-purchases'
import { SummaryCards } from '@/features/account/dashboard/summary-cards'
import { AccountHeader } from '@/features/account/layout/account-header'
import { AccountNav } from '@/features/account/layout/account-nav'

export const metadata: Metadata = { title: 'پیشخوان' }

/**
 * `/account/`: the dashboard (account guide §2, page 1). The greeting, the summary's counters
 * and order groups, the latest purchases, then the live banners. The visitor's data is read in
 * the browser through the BFF, each section with its own skeleton. The banners are read on the
 * server and streamed (a secondary section: the page never waits for them); they come last, so
 * when there is none (the usual case) their skeleton's place closes below everything read.
 * Below lg it is also the hub: who is signed in and every other account page as a large row
 * (the side column takes that role from lg).
 */
export default function AccountDashboardPage() {
  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <DashboardGreeting />
      <SummaryCards />
      <OrderStatusStrip />
      <div className="overflow-hidden rounded-card bg-white shadow-card lg:hidden">
        <AccountHeader className="border-b border-ink-100 p-4" />
        <AccountNav variant="hub" />
      </div>
      <RecentPurchases />
      <Suspense fallback={<BannersSkeleton />}>
        <LiveBanners />
      </Suspense>
    </div>
  )
}
