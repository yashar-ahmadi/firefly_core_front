import type { Metadata } from 'next'
import { CommentsPage } from '@/features/account/comments/comments-page'

// «دیدگاه‌های من» (noindex and per visitor, like every account page: see the account layout).
// The page reads and writes everything in the browser through the BFF. (The title lives here: a
// constant imported from a client module would reach this server file as a client reference.)

const TITLE = 'دیدگاه‌های من'

export const metadata: Metadata = { title: TITLE }

export default function AccountCommentsPage() {
  return <CommentsPage title={TITLE} />
}
