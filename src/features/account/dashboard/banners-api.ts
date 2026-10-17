import 'server-only'
import { SHELL_TIMEOUT_MS } from '@/features/settings/load'
import { ApiError } from '@/lib/api/errors'
import { apiFetch } from '@/lib/api/server'
import type { Paginated } from '@/lib/api/types/common'
import type { DashboardBanner } from '@/lib/api/types/dashboard'

/**
 * The window of a live banner is not exposed (digest §3.7): never share this list for more than
 * a minute.
 */
const REVALIDATE_SECONDS = 60

/**
 * `GET dashboard/banner/list/`: the live dashboard banners, in the operator's order. Public and
 * viewer-blind (the token is ignored), so read anonymously and kept in the data cache like the
 * homepage's banners: the account page itself is never cached, this list is the same for
 * everyone. Never throws: a failure is logged once (status and code only) and shows no banner.
 */
export async function getDashboardBanners(): Promise<DashboardBanner[]> {
  try {
    const { data } = await apiFetch<Paginated<DashboardBanner>>('dashboard/banner/list/', {
      revalidate: REVALIDATE_SECONDS,
      tags: ['dashboard-banners'],
      timeoutMs: SHELL_TIMEOUT_MS,
    })
    if (!Array.isArray(data?.results)) throw new Error('unexpected dashboard/banner/list payload')
    return data.results
  } catch (error) {
    const reason =
      error instanceof ApiError
        ? `${error.status} ${error.code}`
        : error instanceof Error
          ? error.message
          : String(error)
    console.error('[dashboard] banners failed:', reason)
    return []
  }
}
