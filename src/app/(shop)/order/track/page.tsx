import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { CONTAINER } from '@/components/layout/container'
import { cn } from '@/components/ui/cn'
import { TrackOrder } from '@/features/orders/track/track-loader'
import { seoMetadata } from '@/features/seo/metadata'
import { shopName } from '@/features/seo/shop-name'
import { getSiteSettings } from '@/features/settings/api'
import { formatIranMobile } from '@/lib/format/phone'

const TITLE = 'پیگیری سفارش'
const PATH = '/order/track/'

// Guest order tracking (order digest §3.1.8; Plan 4 Global Constraints: noindex, dynamic): in the
// shop's frame, rendered on every request, never cached or indexed. No loading.tsx (R9). The
// server renders the heading and the form only: the lookup (code and mobile, a lookup key) is a
// POST from the browser and its answer is drawn there, so no order is ever in the server's HTML,
// a URL or a log.
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return {
    ...seoMetadata({ path: PATH, noindex: true, siteName: await shopName() }),
    title: TITLE,
  }
}

export default async function TrackRoute() {
  const settings = await getSiteSettings()
  const phone = settings?.phone?.trim() || null
  // Formatted here: the island never loads the phone formatter (the JS budget).
  const support = phone ? { tel: phone, shown: formatIranMobile(phone) } : null
  return (
    <div className={cn(CONTAINER, 'flex flex-col gap-3 pt-2 pb-10 md:gap-4 md:pt-4 md:pb-14')}>
      <Breadcrumbs items={[{ name: TITLE }]} />
      <div className="flex flex-col gap-1">
        <h1 className="text-xl leading-9 font-bold text-ink-900 md:text-2xl md:leading-10">
          {TITLE}
        </h1>
        <p className="text-base leading-7 text-ink-700">
          با کد سفارش و شمارهٔ موبایل خریدار یا گیرنده، وضعیت سفارش را ببینید.
        </p>
      </div>
      <TrackOrder support={support} />
    </div>
  )
}
