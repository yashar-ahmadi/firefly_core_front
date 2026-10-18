import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { OrderDetailPage } from '@/features/orders/account/order-detail-page'
import { readAccountOrder } from '@/features/orders/account/order-read'
import { getPaymentCatalog } from '@/features/payment/catalog'
import { notFoundMetadata } from '@/features/seo/not-found-metadata'
import { getSiteSettings } from '@/features/settings/api'
import { toPersianDigits } from '@/lib/format'

// An account order (order digest §3.1.3, §6.4): per visitor, never cached, noindex (the account
// layout). No loading.tsx (R9): the order is read on the server with the session before anything
// renders, so an order that is not this account's (or none) is a real 404 (not-found.tsx beside
// this file, inside the account shell). When the server cannot tell (no usable token yet, no
// answer), the page reads the order in the browser and says «سفارش پیدا نشد» there on a 404.
export const dynamic = 'force-dynamic'

type Params = Promise<{ code: string }>

/** An order code: exactly 10 digits (it may start with 0; other shapes never reach the API). */
const CODE = /^\d{10}$/

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { code } = await params
  if (!CODE.test(code) || (await readAccountOrder(code)).kind === 'missing') {
    return notFoundMetadata()
  }
  return { title: `سفارش ${toPersianDigits(code)}` }
}

export default async function AccountOrderPage({ params }: { params: Params }) {
  const { code } = await params
  if (!CODE.test(code)) notFound()
  const [read, catalog, settings] = await Promise.all([
    readAccountOrder(code),
    getPaymentCatalog(),
    getSiteSettings(),
  ])
  if (read.kind === 'missing') notFound()
  return (
    <OrderDetailPage
      code={code}
      initial={read.kind === 'found' ? read.order : null}
      catalog={catalog}
      supportPhone={settings?.phone?.trim() || null}
    />
  )
}
