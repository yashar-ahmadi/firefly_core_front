import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CONTAINER } from '@/components/layout/container'
import { cn } from '@/components/ui/cn'
import { CardTransfer } from '@/features/payment/card-transfer/card-transfer-loader'
import { PAGE_TITLE } from '@/features/payment/card-transfer/transfer-copy'
import { getPaymentCatalog } from '@/features/payment/catalog'
import { notFoundMetadata } from '@/features/seo/not-found-metadata'
import { seoMetadata } from '@/features/seo/metadata'
import { shopName } from '@/features/seo/shop-name'
import { getSiteSettings } from '@/features/settings/api'
import { formatIranMobile } from '@/lib/format/phone'

// A card-to-card payment (order digest §5.7): where an order's card-transfer attempt sends the
// shopper (the checkout, the payment link, the resume UI: always a full page load). Per visitor
// and per payment: rendered on every request, never cached, never indexed (Plan 4), in the
// checkout's quiet frame. No loading.tsx (R9): a uuid of the wrong shape is a real 404 before
// anything renders, with no API call. The cards themselves are read in the browser (the island,
// card-transfer-page.tsx: always `GET payment/<uuid>/card-transfer/`). Its URL holds the payment's
// uuid, a credential: no operator code, no referrer (credential-routes.ts), its metadata names no
// URL (no canonical), and nothing here logs it.
export const dynamic = 'force-dynamic'

/** A payment uuid's shape (the API's URL resolver refuses anything else, digest §1.2). */
const PAYMENT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Params = Promise<{ uuid: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { uuid } = await params
  if (!PAYMENT_UUID.test(uuid)) return notFoundMetadata()
  return {
    ...seoMetadata({
      path: '/payment/card-transfer/',
      noindex: true,
      noCanonical: true,
      siteName: await shopName(),
    }),
    title: PAGE_TITLE,
  }
}

export default async function CardTransferRoute({ params }: { params: Params }) {
  const { uuid } = await params
  if (!PAYMENT_UUID.test(uuid)) notFound()
  const [settings, catalog] = await Promise.all([getSiteSettings(), getPaymentCatalog()])
  const phone = settings?.phone?.trim() || null
  // Formatted here: the island never loads the phone formatter (the JS budget, result-actions).
  const support = phone ? { tel: phone, shown: formatIranMobile(phone) } : null
  // The route's instruction, sanitised here (the payment step's own catalog: the same operator
  // text the cards read returns); undefined when the list could not be read or lacks the route.
  const method = catalog.methods?.find((item) => item.route === 'card_transfer')
  return (
    <div className={cn(CONTAINER, 'pt-6 pb-12 md:pt-10 md:pb-16')}>
      <CardTransfer
        uuid={uuid.toLowerCase()}
        instruction={method ? method.instruction : undefined}
        support={support}
      />
    </div>
  )
}
