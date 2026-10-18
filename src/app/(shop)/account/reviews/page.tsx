import type { Metadata } from 'next'
import { AwaitingReviewsPage } from '@/features/orders/reviews/awaiting-reviews-page'

// «در انتظار دیدگاه» (noindex, per visitor, never cached: the account layout; no loading.tsx).
// The purchases are read and reviewed in the browser through the BFF. (The title lives here: a
// constant imported from a client module would reach this server file as a client reference.)

const TITLE = 'در انتظار دیدگاه'

export const metadata: Metadata = { title: TITLE }

export default function AccountReviewsPage() {
  return <AwaitingReviewsPage title={TITLE} />
}
