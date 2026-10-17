import type { Metadata } from 'next'
import { ComingSoon } from '@/features/account/layout/coming-soon'

// A placeholder (noindex and per visitor, like every account page: see the account layout).
// Plan 4 replaces this file with the orders page (tabs from the summary's `orders.groups`).

const TITLE = 'سفارش‌ها'

export const metadata: Metadata = { title: TITLE }

export default function OrdersPage() {
  return (
    <ComingSoon
      title={TITLE}
      description="به‌زودی سفارش‌هایتان را همین‌جا می‌بینید و وضعیت هر کدام را دنبال می‌کنید."
    />
  )
}
