import type { Metadata } from 'next'
import { AddressList } from '@/features/account/addresses/address-list'

// The address book (noindex and per visitor, like every account page: see the account layout).
// The page reads and writes everything in the browser through the BFF. (The title lives here: a
// constant imported from a client module would reach this server file as a client reference.)

const TITLE = 'آدرس‌های من'

export const metadata: Metadata = { title: TITLE }

export default function AccountAddressesPage() {
  return <AddressList title={TITLE} />
}
