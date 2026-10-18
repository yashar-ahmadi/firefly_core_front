import type { Metadata } from 'next'
import { getPaymentCatalog } from '@/features/payment/catalog'
import { getSiteSettings } from '@/features/settings/api'
import { WalletPage } from '@/features/wallet/wallet-page'

// «کیف پول» (noindex, per visitor, never cached: the account layout; no loading.tsx). The wallet,
// its ledger, withdrawals and payments are read in the browser through the BFF (the URL's tab and
// filters); the payment catalog (anonymous, the server's 60 s cache: the top-up's gateways) and
// the support line come from here. (The title lives here: a constant imported from a client
// module would reach this server file as a client reference.)

const TITLE = 'کیف پول'

export const metadata: Metadata = { title: TITLE }
export const dynamic = 'force-dynamic'

export default async function AccountWalletPage() {
  const [catalog, settings] = await Promise.all([getPaymentCatalog(), getSiteSettings()])
  return (
    <WalletPage title={TITLE} catalog={catalog} supportPhone={settings?.phone?.trim() || null} />
  )
}
