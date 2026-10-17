import type { Metadata } from 'next'
import { NotificationsPage } from '@/features/notifications/notifications-page'

// «اعلان‌ها» (noindex and per visitor, like every account page: see the account layout). The
// inbox is read and written in the browser through the BFF. (The title lives here: a constant
// imported from a client module would reach this server file as a client reference.)

const TITLE = 'اعلان‌ها'

export const metadata: Metadata = { title: TITLE }

export default function AccountNotificationsPage() {
  return <NotificationsPage title={TITLE} />
}
