import type { Metadata } from 'next'
import { CONTAINER } from '@/components/layout/container'
import { cn } from '@/components/ui/cn'
import { NOT_FOUND_TITLE, TransferRefusal } from '@/features/payment/card-transfer/transfer-refusal'
import { shopName } from '@/features/seo/shop-name'
import { getSiteSettings } from '@/features/settings/api'
import { formatIranMobile } from '@/lib/format/phone'

/**
 * The 404's title. A page that throws `notFound()` loses its own metadata: Next takes this
 * file's instead (noindex is added to the 404 itself).
 */
export async function generateMetadata(): Promise<Metadata> {
  return { title: { absolute: `${NOT_FOUND_TITLE} | ${await shopName()}` } }
}

/**
 * `/payment/card-transfer/<uuid>/` whose uuid is not a payment's shape (the API is never asked):
 * the card-transfer page's own calm page, in the checkout's frame, with tracking and the support
 * line, and a real 404 status.
 */
export default async function CardTransferNotFound() {
  const settings = await getSiteSettings()
  const phone = settings?.phone?.trim() || null
  return (
    <div className={cn(CONTAINER, 'pt-6 pb-12 md:pt-10 md:pb-16')}>
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 rounded-card bg-white p-5 shadow-card md:p-8">
        <TransferRefusal
          refusal={{ kind: 'not_found', retryAfter: null }}
          support={phone ? { tel: phone, shown: formatIranMobile(phone) } : null}
        />
      </section>
    </div>
  )
}
