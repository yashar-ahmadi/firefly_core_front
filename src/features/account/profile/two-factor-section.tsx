'use client'

import { Badge } from '@/components/ui/badge'
import { ListError } from '@/features/account/lists/list-error'
import { isLoadingSection } from '../use-account-query'
import { ProfileSection } from './profile-section'
import { TwoFactorBody } from './two-factor-body'
import { useTotpStatus } from './use-totp-status'

/**
 * Two-step login with an authenticator app (auth digest §4.19, F10). Its state comes from the
 * status endpoint (a skeleton until it answers); on → setup (QR code and key) → a code enables
 * it; a code disables it. 5 wrong codes lock the second factor for `retry_after`.
 */
export function TwoFactorSection() {
  const status = useTotpStatus()
  const loading = isLoadingSection(status)
  const enabled = status.data?.is_totp_enabled
  return (
    <ProfileSection
      title="ورود دومرحله‌ای"
      loading={loading}
      skeletonFields={1}
      badge={
        enabled === undefined ? null : (
          <Badge tone={enabled ? 'success' : 'neutral'} size="sm">
            {enabled ? 'فعال' : 'غیرفعال'}
          </Badge>
        )
      }
    >
      {enabled === undefined ? (
        <ListError
          frame="inline"
          error={status.error}
          errorAt={status.errorUpdatedAt}
          message="وضعیت ورود دومرحله‌ای بارگذاری نشد."
          onRetry={() => void status.refetch()}
          retrying={status.isFetching}
        />
      ) : (
        <TwoFactorBody enabled={enabled} />
      )}
    </ProfileSection>
  )
}
