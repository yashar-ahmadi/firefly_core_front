import type { Metadata } from 'next'
import { OrdersPage } from '@/features/orders/account/orders-page'
import { getPaymentCatalog } from '@/features/payment/catalog'
import { getSiteSettings } from '@/features/settings/api'

// «سفارش‌های من» (noindex, per visitor, never cached: the account layout; no loading.tsx). The
// orders are read in the browser through the BFF (the URL's tabs, sort, search and page); the
// payment catalog (anonymous, the server's 60 s cache, its route texts sanitised there) and the
// support line come from here for the pay sheet. (The title lives here: a constant imported from
// a client module would reach this server file as a client reference.)

const TITLE = 'سفارش‌های من'

export const metadata: Metadata = { title: TITLE }

export default async function AccountOrdersPage() {
  const [catalog, settings] = await Promise.all([getPaymentCatalog(), getSiteSettings()])
  return (
    <OrdersPage title={TITLE} catalog={catalog} supportPhone={settings?.phone?.trim() || null} />
  )
}
