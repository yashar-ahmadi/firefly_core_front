import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CONTAINER } from '@/components/layout/container'
import { cn } from '@/components/ui/cn'
import { ThanksPage } from '@/features/checkout/thanks/thanks-page'
import { notFoundMetadata } from '@/features/seo/not-found-metadata'
import { seoMetadata } from '@/features/seo/metadata'
import { shopName } from '@/features/seo/shop-name'
import { getSiteSettings } from '@/features/settings/api'

const TITLE = 'ثبت سفارش'
/** An order code: exactly 10 digits, may start with 0 (order digest §1.3). */
const ORDER_CODE = /^\d{10}$/

// The visitor's own order, read from this tab (the placement's hand-off) or this device (a
// guest's recent orders): per visitor, never cached, never indexed. No loading.tsx (R9).
export const dynamic = 'force-dynamic'

type Params = Promise<{ code: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { code } = await params
  if (!ORDER_CODE.test(code)) return notFoundMetadata()
  return {
    ...seoMetadata({
      path: `/checkout/thanks/${code}/`,
      noindex: true,
      siteName: await shopName(),
    }),
    title: TITLE,
  }
}

/**
 * `/checkout/thanks/<code>/`: after placement (spec §8.7, order digest §5.1–5.2). The page itself
 * is the browser's (ThanksPage): what this tab or device knows of the order, never more than
 * the server said; opened elsewhere, a calm page with the ways to find the order.
 */
export default async function ThanksRoute({ params }: { params: Params }) {
  const { code } = await params
  if (!ORDER_CODE.test(code)) notFound()
  const settings = await getSiteSettings()
  return (
    <div className={cn(CONTAINER, 'flex flex-col gap-4 pt-6 pb-12 md:pt-10 md:pb-16')}>
      <div className="mx-auto w-full max-w-3xl">
        <ThanksPage code={code} supportPhone={settings?.phone?.trim() || null} />
      </div>
    </div>
  )
}
