'use client'

import { createContext, useContext } from 'react'
import type { AuthSettings } from '@/lib/api/types/settings'

/**
 * The `auth` block of `global/settings/`, which the login and registration forms are built from
 * (and nothing else: never assume SMS, Telegram or Google exist). The root layout reads it with
 * the shop settings and the root Providers hand it down; without settings every method is off.
 */
export const AuthSettingsContext = createContext<AuthSettings | null>(null)

/** The sign-in and registration methods on offer. Throws outside the root Providers. */
export function useAuthSettings(): AuthSettings {
  const settings = useContext(AuthSettingsContext)
  if (!settings) throw new Error('useAuthSettings must be used inside the root Providers')
  return settings
}
