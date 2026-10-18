import { ClipboardX } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { buttonClasses } from '@/components/ui/button-styles'
import { EmptyState } from '@/components/ui/empty-state'
import { notFoundMetadata } from '@/features/seo/not-found-metadata'

/** The 404's head (a page that throws `notFound()` takes this file's metadata). */
export function generateMetadata(): Promise<Metadata> {
  return notFoundMetadata()
}

/**
 * An order that is not this account's (or none: the API answers both alike, order digest §3)
 * from `/account/orders/<code>/`: a 404 inside the account shell, with the way to the orders.
 */
export default function AccountOrderNotFound() {
  return (
    <>
      <h1 className="mb-4 text-xl leading-9 font-bold text-ink-900 md:mb-6 md:text-2xl md:leading-10">
        سفارش پیدا نشد
      </h1>
      <EmptyState
        icon={<ClipboardX />}
        title="این سفارش در حساب شما نیست"
        description="کد سفارش را بررسی کنید یا سفارش را از فهرست سفارش‌هایتان باز کنید."
        className="rounded-card bg-white py-12 shadow-card"
        action={
          <Link href="/account/orders/" className={buttonClasses({ variant: 'outline' })}>
            سفارش‌های من
          </Link>
        }
      />
    </>
  )
}
