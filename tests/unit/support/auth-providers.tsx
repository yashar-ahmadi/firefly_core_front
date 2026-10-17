import type { QueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { AuthSettingsContext } from '@/features/auth/use-auth-settings'
import { FeatureProvider, type FeatureMap } from '@/features/settings/feature-context'
import type { AuthSettings } from '@/lib/api/types/settings'
import { emailOnlyAuth } from './auth'
import { clientProviders } from './providers'

/**
 * What the sign-in forms read besides `clientProviders`: the settings' `auth` block (the live
 * dev value by default) and the feature switches (all on unless given).
 */
export function authProviders({
  auth = emailOnlyAuth(),
  hasSession = false,
  features = {},
  client,
}: {
  auth?: AuthSettings
  hasSession?: boolean
  features?: Partial<FeatureMap>
  client?: QueryClient
} = {}): { client: QueryClient; wrapper: (props: { children: ReactNode }) => ReactNode } {
  const base = clientProviders({ hasSession, client })
  const Base = base.wrapper
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AuthSettingsContext value={auth}>
      <FeatureProvider initial={features}>
        <Base>{children}</Base>
      </FeatureProvider>
    </AuthSettingsContext>
  )
  return { client: base.client, wrapper }
}

/** Phone codes over SMS and Telegram as well (Telegram preselected), and Google. */
export function everyMethodAuth(): AuthSettings {
  return {
    google_login_enabled: true,
    google_client_id: 'client-id.apps.googleusercontent.com',
    sms_otp_enabled: true,
    telegram_otp_enabled: true,
    available_otp_methods: ['email', 'sms', 'telegram'],
    registration_methods: ['email', 'phone'],
    default_otp_methods: { email: 'email', phone: 'telegram' },
  }
}
