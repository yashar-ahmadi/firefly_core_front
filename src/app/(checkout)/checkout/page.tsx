import type { Metadata } from 'next'
import { CONTAINER } from '@/components/layout/container'
import { cn } from '@/components/ui/cn'
import { CHECKOUT_HEADING_ID } from '@/features/checkout/checkout-heading'
import { CheckoutPage } from '@/features/checkout/checkout-page'
import { seoMetadata } from '@/features/seo/metadata'
import { shopName } from '@/features/seo/shop-name'

const TITLE = 'تکمیل خرید'
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
 * the BFF (CheckoutPage: a skeleton until the cart is there).
 */
export default function CheckoutRoute() {
  return (
    <div className={cn(CONTAINER, 'flex flex-col gap-3 pt-4 pb-10 md:gap-4 md:pt-6 md:pb-14')}>
      <h1
        id={CHECKOUT_HEADING_ID}
        tabIndex={-1}
        className="text-xl leading-9 font-bold text-ink-900 outline-none md:text-2xl md:leading-10"
      >
        {TITLE}
      </h1>
      <CheckoutPage />
    </div>
  )
}
