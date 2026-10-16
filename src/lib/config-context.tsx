'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { PublicStoreConfig } from '@/config/resolve-store-config'

// The browser-safe store configuration (no API URL), handed down from the root layout.

const StoreConfigContext = createContext<PublicStoreConfig | null>(null)

export function StoreConfigProvider({
  value,
  children,
}: {
  value: PublicStoreConfig
  children: ReactNode
}) {
  return <StoreConfigContext value={value}>{children}</StoreConfigContext>
}

/** The store configuration. Throws outside `StoreConfigProvider` (the root providers mount it). */
export function useStoreConfig(): PublicStoreConfig {
  const config = useContext(StoreConfigContext)
  if (!config) throw new Error('useStoreConfig must be used inside StoreConfigProvider')
  return config
}

/** The store configuration, or null outside the provider (for primitives that work without it). */
export function useOptionalStoreConfig(): PublicStoreConfig | null {
  return useContext(StoreConfigContext)
}
