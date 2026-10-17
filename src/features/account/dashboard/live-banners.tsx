import dynamic from 'next/dynamic'
import { cn } from '@/components/ui/cn'
import { SKELETON } from '@/components/ui/skeleton'
import { WidgetBoundary } from '@/components/ui/widget-boundary'
import { BANNER_RATIO } from './banner-frame'
import { getDashboardBanners } from './banners-api'

/** Banners are rare (the dev data has none): their carousel's code loads only with one. */
const NoBanners = () => null
const DashboardBanners = dynamic(() =>
  import('./dashboard-banners').then((banners) => banners.DashboardBanners).catch(() => NoBanners),
)

/**
 * The dashboard's live banners, for a `<Suspense>` of the page: the list is read here (public,
 * cached a minute), so the page is sent without waiting for it and the banners stream in with
 * the same response. Server-rendered when there are some; their client code (the carousel) is
 * loaded only then, inside a WidgetBoundary, so a chunk that cannot load takes only them away.
 */
export async function LiveBanners() {
  const banners = await getDashboardBanners()
  return (
    <WidgetBoundary name="dashboard-banners">
      <DashboardBanners banners={banners} />
    </WidgetBoundary>
  )
}

/** Their place while the list is read: one banner frame. */
export function BannersSkeleton() {
  return (
    <div
      aria-hidden
      data-banner-skeleton=""
      className={cn(SKELETON, BANNER_RATIO, 'rounded-card')}
    />
  )
}
