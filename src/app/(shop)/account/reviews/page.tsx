import type { Metadata } from 'next'
import { ComingSoon } from '@/features/account/layout/coming-soon'

// A placeholder (noindex and per visitor, like every account page: see the account layout).
// Plan 4 replaces this file with the purchases awaiting a review.

const TITLE = 'در انتظار دیدگاه'

export const metadata: Metadata = { title: TITLE }

export default function AwaitingReviewPage() {
  return (
    <ComingSoon
      title={TITLE}
      description="به‌زودی کالاهایی را که خریده‌اید همین‌جا می‌بینید تا درباره‌شان دیدگاه بنویسید."
    />
  )
}
