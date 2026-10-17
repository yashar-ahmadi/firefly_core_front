import type { Metadata } from 'next'
import { AccountPageHeader } from '@/features/account/layout/account-page-header'
import { ProfilePage } from '@/features/account/profile/profile-page'

// The profile and its security (noindex and per visitor, like every account page: see the
// account layout). The page reads everything in the browser through the BFF.

const TITLE = 'اطلاعات حساب'

export const metadata: Metadata = { title: TITLE }

export default function AccountProfilePage() {
  return (
    <>
      <AccountPageHeader title={TITLE} />
      <ProfilePage />
    </>
  )
}
