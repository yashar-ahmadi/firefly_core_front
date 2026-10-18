import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CONTAINER } from '@/components/layout/container'
import { cn } from '@/components/ui/cn'
import { getPaymentCatalog } from '@/features/payment/catalog'
import { REFUSAL_COPY } from '@/features/payment/link-refusal'
import { PayLinkPage } from '@/features/payment/pay-link-loader'
import { LINK_TOKEN, readPayLink } from '@/features/payment/pay-link-read'
import { PayLinkRefusal } from '@/features/payment/pay-link-refusal'
import { payLinkPath } from '@/features/orders/pay-link'
import { notFoundMetadata } from '@/features/seo/not-found-metadata'
import { seoMetadata } from '@/features/seo/metadata'
import { shopName } from '@/features/seo/shop-name'
import { getSiteSettings } from '@/features/settings/api'
import { toPersianDigits } from '@/lib/format'

// The payment link (order digest §0 #3, §3.1.9): the SMS sends `/order/pay/<token>` without
// the trailing slash, which next.config's `trailingSlash` answers with a 308 to this page, the
// token kept. Per visitor and per order: rendered on every request, never cached, never indexed
// (Plan 4), in the checkout's quiet frame. No loading.tsx (R9): the order is read before
// anything renders, and an unknown token (or a cancelled order's) is a real 404. Its URL holds
// the token, a credential: no operator code, no referrer (credential-routes.ts), and its
// metadata names no URL (no canonical).
export const dynamic = 'force-dynamic'

type Params = Promise<{ token: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { token } = await params
  const read = LINK_TOKEN.test(token) ? await readPayLink(token) : null
  if (!read || (!read.ok && read.refusal.kind === 'invalid')) return notFoundMetadata()
  const title = read.ok
    ? `پرداخت سفارش ${toPersianDigits(read.link.order_code)}`
    : REFUSAL_COPY[read.refusal.kind].title
  return {
    ...seoMetadata({
      path: '/order/pay/',
      noindex: true,
      noCanonical: true,
      siteName: await shopName(),
    }),
    title,
  }
}

export default async function PayLinkRoute({ params }: { params: Params }) {
  const { token } = await params
  // Not a token's shape: no API call (the API would answer 404 too).
  if (!LINK_TOKEN.test(token)) notFound()
  const [read, settings] = await Promise.all([readPayLink(token), getSiteSettings()])
  if (!read.ok && read.refusal.kind === 'invalid') notFound()
  const supportPhone = settings?.phone?.trim() || null
  return (
    <div className={cn(CONTAINER, 'flex flex-col gap-4 pt-6 pb-12 md:pt-10 md:pb-16')}>
      {read.ok ? (
        <PayLinkPage
          token={token}
          link={read.link}
          catalog={await getPaymentCatalog()}
          supportPhone={supportPhone}
        />
      ) : (
        <PayLinkRefusal
          refusal={read.refusal}
          supportPhone={supportPhone}
          retryHref={payLinkPath(token)}
          linkToken={token}
        />
      )}
    </div>
  )
}
