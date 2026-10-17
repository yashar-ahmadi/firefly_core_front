import { bffFetch } from '@/lib/api/client'
import type { UserProfile } from '@/lib/api/types/account'

export interface ReadOptions {
  signal?: AbortSignal
}

/**
 * `GET account/profile/me/` (through the BFF), in a module of its own: `useMe` runs in the
 * header on every page, which must not bring the rest of `authApi` (every auth endpoint) along.
 */
export async function fetchProfile({ signal }: ReadOptions = {}): Promise<UserProfile> {
  return (await bffFetch<UserProfile>('account/profile/me/', { signal })).data
}
