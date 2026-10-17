'use client'

import { SectionError } from '@/features/account/dashboard/section-error'
import { useMe } from '@/features/auth/use-me'
import { AvatarUpload } from './avatar-upload'
import { ContactSection } from './contact-section'
import { PasswordSection } from './password-section'
import { ProfileForm } from './profile-form'
import { SessionsSection } from './sessions-section'
import { TwoFactorSection } from './two-factor-section'

/**
 * `/account/profile/`: one card per concern, each saving on its own. The profile (`['me']`, read
 * through the BFF) feeds the first four, each with its skeleton until it is in; two-step login
 * reads its own status, and the sessions card needs nothing. A profile that cannot be read
 * offers «تلاش دوباره» in their place. (`null`: the session just ended and login is replacing
 * the page, so the skeletons stay.)
 */
export function ProfilePage() {
  const query = useMe()
  const me = query.data ?? undefined
  const failed = query.isError && query.data === undefined
  return (
    <div className="flex flex-col gap-5 md:gap-6">
      {failed ? (
        <div className="rounded-card bg-white shadow-card">
          <SectionError
            message="اطلاعات حساب بارگذاری نشد."
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
            className="min-h-32"
          />
        </div>
      ) : (
        <>
          <ProfileForm me={me} />
          <AvatarUpload me={me} />
          <ContactSection me={me} />
          <PasswordSection me={me} />
        </>
      )}
      <TwoFactorSection />
      <SessionsSection />
    </div>
  )
}
