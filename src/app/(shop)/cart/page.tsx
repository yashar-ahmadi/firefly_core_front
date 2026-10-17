import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { CONTAINER } from '@/components/layout/container'
import { cn } from '@/components/ui/cn'
import { CartPage } from '@/features/cart/components/cart-page'
import { seoMetadata } from '@/features/seo/metadata'
import { shopName } from '@/features/seo/shop-name'

const TITLE = 'سبد خرید'
const PATH = '/cart/'

// The visitor's own cart: rendered on every request and never cached (Plan 4: `/cart/` is
// noindex and dynamic). No loading.tsx (ruling R9): the page shows its own skeleton.
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return {
    ...seoMetadata({ path: PATH, noindex: true, siteName: await shopName() }),
    title: TITLE,
  }
}

/**
 * `/cart/` (spec §8.6): the heading, then the cart itself, read in the browser through the BFF
 * (CartPage: a skeleton until it is there). Server pages are identical for every visitor; the
 * cart never is.
 */
export default function CartRoute() {
  return (
    <div className={cn(CONTAINER, 'flex flex-col gap-3 pt-2 pb-10 md:gap-4 md:pt-4 md:pb-14')}>
      <Breadcrumbs items={[{ name: TITLE }]} />
      <h1 className="text-xl leading-9 font-bold text-ink-900 md:text-2xl md:leading-10">
        {TITLE}
      </h1>
      <CartPage />
    </div>
  )
}
