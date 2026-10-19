import type { Metadata } from 'next'
import { CONTAINER } from '@/components/layout/container'
import { cn } from '@/components/ui/cn'
import { CHECKOUT_HEADING_ID } from '@/features/checkout/checkout-heading'
import { CheckoutPage } from '@/features/checkout/checkout-page'
import { checkoutTerms } from '@/features/checkout/terms'
import { DynamicSlot } from '@/features/content/dynamic/dynamic-slot'
import { SLOT_KEYS } from '@/features/content/dynamic/slot-keys'
import { getPaymentCatalog } from '@/features/payment/catalog'
import { seoMetadata } from '@/features/seo/metadata'
import { shopName } from '@/features/seo/shop-name'
import { getSiteSettings } from '@/features/settings/api'

const TITLE = 'تکمیل خرید'
/** The terms slots' dialog links, beside the review's terms checkbox. */
const TERMS_LINK = 'مطالعهٔ قوانین'
const RETURN_POLICY_LINK = 'رویهٔ بازگرداندن کالا'
const PATH = '/checkout/'

// The visitor's own checkout: rendered on every request and never cached (Plan 4: noindex and
// dynamic). No loading.tsx (ruling R9): the page shows its own skeleton.
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return {
    ...seoMetadata({ path: PATH, noindex: true, siteName: await shopName() }),
    title: TITLE,
  }
}

/**
 * `/checkout/` (spec §8.7): the heading, then the checkout itself, read in the browser through
 * the BFF (CheckoutPage: a skeleton until the cart is there). The payment catalog comes from the
 * server's 60 s cache (order digest §1.6), and the operator's texts are sanitised here: neither
 * the parser nor a per-visitor copy of the lists reaches the browser.
 */
export default async function CheckoutRoute() {
  const [catalog, settings] = await Promise.all([getPaymentCatalog(), getSiteSettings()])
  return (
    <div className={cn(CONTAINER, 'flex flex-col gap-3 pt-4 pb-10 md:gap-4 md:pt-6 md:pb-14')}>
      <h1
        id={CHECKOUT_HEADING_ID}
        tabIndex={-1}
        className="text-xl leading-9 font-bold text-ink-900 outline-none md:text-2xl md:leading-10"
      >
        {TITLE}
      </h1>
      {/* The operator's `checkout` message slot; its links, like the terms', in a new tab. */}
      <DynamicSlot pageType={SLOT_KEYS.checkout} variant="inline" newTabLinks />
      <CheckoutPage
        catalog={catalog}
        terms={checkoutTerms(settings)}
        termsLinks={
          <>
            <DynamicSlot
              pageType={SLOT_KEYS.terms}
              variant="dialog-link"
              label={TERMS_LINK}
              newTabLinks
            />
            <DynamicSlot
              pageType={SLOT_KEYS.returnPolicy}
              variant="dialog-link"
              label={RETURN_POLICY_LINK}
              newTabLinks
            />
          </>
        }
        supportPhone={settings?.phone?.trim() || null}
      />
    </div>
  )
}
