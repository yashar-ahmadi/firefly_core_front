import type { Metadata } from 'next'
import dynamic from 'next/dynamic'
import { WidgetBoundary } from '@/components/ui/widget-boundary'
import { getDashboardBanners } from '@/features/account/dashboard/banners-api'
import { DashboardGreeting } from '@/features/account/dashboard/greeting'
import { OrderStatusStrip } from '@/features/account/dashboard/order-status-strip'
import { RecentPurchases } from '@/features/account/dashboard/recent-purchases'
import { SummaryCards } from '@/features/account/dashboard/summary-cards'
import { AccountHeader } from '@/features/account/layout/account-header'
import { AccountNav } from '@/features/account/layout/account-nav'

export const metadata: Metadata = { title: 'پیشخوان' }

/** Banners are rare (the dev data has none): their carousel's code loads only with one. */
const NoBanners = () => null
const DashboardBanners = dynamic(() =>
  import('@/features/account/dashboard/dashboard-banners')
    .then((banners) => banners.DashboardBanners)
    .catch(() => NoBanners),
)

/**
 * `/account/`: the dashboard (account guide §2, page 1). The greeting, the summary's counters
 * and order groups, the live banners (read here, on the server: public and cached a minute;
 * server-rendered, their client code loaded only when there is one, inside a WidgetBoundary so a
 * chunk that cannot load takes only them off the page) and the latest purchases. The visitor's
 * data is read in the browser through the BFF, each section with its own skeleton. Below lg it
 * is also the hub: who is signed in and every other account page as a large row (the side column
 * takes that role from lg).
 */
export default async function AccountDashboardPage() {
  const banners = await getDashboardBanners()
  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <DashboardGreeting />
      <SummaryCards />
      <OrderStatusStrip />
      <div className="overflow-hidden rounded-card bg-white shadow-card lg:hidden">
        <AccountHeader className="border-b border-ink-100 p-4" />
        <AccountNav variant="hub" />
      </div>
      <WidgetBoundary name="dashboard-banners">
        <DashboardBanners banners={banners} />
      </WidgetBoundary>
      <RecentPurchases />
    </div>
  )
}
