import 'server-only'
import { parseServerEnv, type ServerEnv } from '@/config/env-schema'

export * from '@/config/env-schema'

let cached: ServerEnv | undefined

/**
 * The validated runtime environment, parsed from `process.env` on first call and memoized.
 * Never call this at module top level: `next build` must work without runtime variables.
 */
export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env)
  return cached
}
