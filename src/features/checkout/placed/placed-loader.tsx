'use client'

import dynamic from 'next/dynamic'
import { Spinner } from '@/components/ui/spinner'
import type { PaymentCatalogState } from '@/features/payment/use-payment-catalog'
import type { PlacedContext } from '../placed-order'
import { PlacedFallback } from './placed-fallback'

// The placed order's payment (placed-order-panel.tsx) loads only once an order exists: its
// intents, the bank's redirect and the ways to pay later never weigh on the checkout's first
// load. The review preloads it. A chunk that cannot load still shows the order and the way to
// its page (the thanks page shows how to pay it).

export interface PlacedPanelProps {
  ctx: PlacedContext
  catalog: PaymentCatalogState
  supportPhone: string | null
}

const load = () => import('./placed-order-panel').then((module) => module.PlacedOrderPanel)

/** Fetches the panel's code ahead of the press (the review is on screen). Never rejects. */
export const preloadPlacedPanel = () => void load().catch(() => undefined)

export const PlacedOrderPanel = dynamic<PlacedPanelProps>(
  () => load().catch(() => PlacedFallback),
  {
    loading: () => (
      <p
        role="status"
        className="flex items-center gap-2 rounded-card bg-white p-5 text-base shadow-card"
      >
        <Spinner aria-hidden />
        {'در حال آماده\u{200C}سازی پرداخت…'}
      </p>
    ),
  },
)
