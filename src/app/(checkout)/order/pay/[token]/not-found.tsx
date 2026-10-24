import type { Metadata } from 'next'
import { CONTAINER } from '@/components/layout/container'
import { cn } from '@/components/ui/cn'
import { REFUSAL_COPY } from '@/features/payment/link-refusal'
import { PayLinkRefusal } from '@/features/payment/pay-link-refusal'
import { NOT_FOUND_ROBOTS } from '@/features/seo/not-found-metadata'
import { shopName } from '@/features/seo/shop-name'
import { getSiteSettings } from '@/features/settings/api'

/**
 * The 404's title. A page that throws `notFound()` loses its own metadata: Next takes this
 * file's instead. Next adds noindex to the 404 itself, its only robots tag (`NOT_FOUND_ROBOTS`).
 */
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: { absolute: `${REFUSAL_COPY.invalid.title} | ${await shopName()}` },
    ...NOT_FOUND_ROBOTS,
  }
}

/**
 * `/order/pay/<token>/` whose token the API does not know (order digest §3.1.9: an unknown or
 * malformed token, or a cancelled order's, whose link was revoked): a calm page inside the
 * checkout's frame, with tracking and the support line, and a real 404 status.
 */
export default async function PayLinkNotFound() {
  const settings = await getSiteSettings()
  return (
    <div className={cn(CONTAINER, 'flex flex-col gap-4 pt-6 pb-12 md:pt-10 md:pb-16')}>
      <PayLinkRefusal
        refusal={{ kind: 'invalid', detail: '', retryAfter: null }}
        supportPhone={settings?.phone?.trim() || null}
      />
    </div>
  )
}
