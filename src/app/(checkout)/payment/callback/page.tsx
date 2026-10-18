import type { Metadata } from 'next'
import { CONTAINER } from '@/components/layout/container'
import { cn } from '@/components/ui/cn'
import { PaymentResult } from '@/features/payment/result-loader'
import { seoMetadata } from '@/features/seo/metadata'
import { shopName } from '@/features/seo/shop-name'
import { getSiteSettings } from '@/features/settings/api'
import { formatIranMobile } from '@/lib/format/phone'

// Where the bank's return lands (order digest §0 #2, §4.2: the admin's «آدرس نتیجهٔ پرداخت»,
// set to `${STOREFRONT_URL}/payment/callback/`): the backend's callback answers 302 here with
// `?result=…&payment=<uuid>&code=…`, for an order's payment and a wallet top-up alike. Per
// visitor: rendered on every request, never cached, never indexed (Plan 4), in the checkout's
// quiet frame. No loading.tsx (R9). The server never reads the query: the page reads it in the
// browser, where the payment's status decides what it says (result-page.tsx). Its URL holds the
// payment's uuid, a credential: no operator code, no referrer (credential-routes.ts), and its
// metadata names no URL (no canonical).
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return {
    ...seoMetadata({
      path: '/payment/callback/',
      noindex: true,
      noCanonical: true,
      siteName: await shopName(),
    }),
    title: 'نتیجهٔ پرداخت',
  }
}

export default async function PaymentCallbackRoute() {
  const settings = await getSiteSettings()
  const phone = settings?.phone?.trim() || null
  // Formatted here: the island never loads the phone formatter (the JS budget, result-actions).
  const support = phone ? { tel: phone, shown: formatIranMobile(phone) } : null
  return (
    <div className={cn(CONTAINER, 'pt-6 pb-12 md:pt-10 md:pb-16')}>
      <PaymentResult support={support} />
    </div>
  )
}
