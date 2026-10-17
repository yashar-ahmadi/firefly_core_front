import type { Metadata } from 'next'
import { ComingSoon } from '@/features/account/layout/coming-soon'

// A placeholder (noindex and per visitor, like every account page: see the account layout).
// Plan 5 replaces this file with the reading list.

const TITLE = 'لیست مطالعه'

export const metadata: Metadata = { title: TITLE }

export default function ReadingListPage() {
  return (
    <ComingSoon
      title={TITLE}
      description="به‌زودی مطلب‌هایی را که برای خواندن نگه داشته‌اید همین‌جا می‌بینید."
    />
  )
}
