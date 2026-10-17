'use client'

import { QueryClientProvider } from '@tanstack/react-query'
import { Direction } from 'radix-ui'
import { useState, type ReactNode } from 'react'
import { Toaster } from '@/components/ui/toaster'
import type { PublicStoreConfig } from '@/config/resolve-store-config'
import { AuthSettingsContext } from '@/features/auth/use-auth-settings'
import {
  FeatureProvider,
  useMarkFeatureDisabled,
  type FeatureMap,
} from '@/features/settings/feature-context'
import type { AuthSettings } from '@/lib/api/types/settings'
import { StoreConfigProvider } from '@/lib/config-context'
import { I18nProvider } from '@/lib/i18n/i18n-context'
import { createQueryClient } from '@/lib/query/query-client'
import { SessionProvider } from '@/lib/session/session-context'

export interface ProvidersProps {
  config: PublicStoreConfig
  /** The settings' `auth` block (`disabledAuth()` without settings), for `useAuthSettings`. */
  auth: AuthSettings
  features: FeatureMap
  /** The operator's dictionary overrides (`getTranslations()`). */
  translations: Record<string, string>
  /** Whether the `ff_auth` flag cookie was present on this request. */
  hasSession: boolean
  children: ReactNode
}

/** One QueryClient per browser session; a `503 feature_disabled` turns that switch off. */
function QueryProvider({ children }: { children: ReactNode }) {
  const markFeatureDisabled = useMarkFeatureDisabled()
  const [client] = useState(() => createQueryClient({ onFeatureDisabled: markFeatureDisabled }))
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

/** Every client-side context of the storefront, mounted once by the root layout. */
export function Providers({
  config,
  auth,
  features,
  translations,
  hasSession,
  children,
}: ProvidersProps) {
  return (
    <Direction.Provider dir="rtl">
      <StoreConfigProvider value={config}>
        <AuthSettingsContext value={auth}>
          <I18nProvider overrides={translations}>
            <SessionProvider initialHasSession={hasSession}>
              <FeatureProvider initial={features}>
                <QueryProvider>
                  {children}
                  <Toaster />
                </QueryProvider>
              </FeatureProvider>
            </SessionProvider>
          </I18nProvider>
        </AuthSettingsContext>
      </StoreConfigProvider>
    </Direction.Provider>
  )
}
