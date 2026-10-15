import 'server-only'
import { getServerEnv } from '@/config/env'
import { resolveStoreConfig, type StoreConfig } from '@/config/resolve-store-config'

export * from '@/config/resolve-store-config'

let cached: StoreConfig | undefined

/** The resolved store configuration, memoized. Server-only: it carries the API URL. */
export function getStoreConfig(): StoreConfig {
  cached ??= resolveStoreConfig(getServerEnv())
  return cached
}
