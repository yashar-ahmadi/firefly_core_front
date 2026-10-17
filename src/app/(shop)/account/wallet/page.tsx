import type { Metadata } from 'next'
import { ComingSoon } from '@/features/account/layout/coming-soon'

// A placeholder (noindex and per visitor, like every account page: see the account layout).
// Plan 4 replaces this file with the wallet page.

const TITLE = 'کیف پول'

export const metadata: Metadata = { title: TITLE }

export default function WalletPage() {
  return (
    <ComingSoon
      title={TITLE}
      description="به‌زودی موجودی و تراکنش‌های کیف پولتان را همین‌جا می‌بینید."
    />
  )
}
