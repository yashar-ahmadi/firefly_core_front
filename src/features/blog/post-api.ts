import 'server-only'
import { cookies } from 'next/headers'
import { cache } from 'react'
import { blogRead } from '@/features/blog/api'
import { oneSegment, visitorIp } from '@/features/catalog/loaders/read'
import { isApiNotFound } from '@/lib/api/errors'
import type { PostDetail } from '@/lib/api/types/blog-post'
import { COOKIE } from '@/lib/auth/cookies'
import { isJwt } from '@/lib/bff/session'

/**
 * A post's page reads (blog digest §1.5, §1.7).
 *
 * `GET blog/post/<slug>/` counts a view on every call, with no dedupe, so it is read **once per
 * page view**: `cache()` shares the one call between `generateMetadata` and the page, and nothing
 * keeps it beyond the request (no Data Cache, no ISR: a cached detail would under-count views,
 * since only its refreshes would reach the API; docs/ARCHITECTURE.md, «Blog post views»). Being
 * per request anyway, it is read as the visitor: their session (a JWT-shaped `ff_at`; the proxy
 * has refreshed an expiring one), so the post's own `is_in_reading_list` is theirs and a staff
 * account sees its drafts (`is_unpublished`), and their IP, for the API's per-IP limit.
 */

/**
 * The post, or null when there is none to show: the API's 404 (missing, a draft, not yet due),
 * a slug that cannot be one segment, or `list` (routed to the post list). Never remembered: a
 * draft may be published, or previewed by staff, at any moment. The blog switch throws a
 * `BlogUnavailableError`; any other failure throws as it came.
 */
export const getPost = cache(async (slug: string): Promise<PostDetail | null> => {
  const segment = oneSegment(slug)
  if (segment === null || segment.text === 'list') return null
  const [cookieStore, forwardedFor] = await Promise.all([cookies(), visitorIp()])
  const access = cookieStore.get(COOKIE.access)?.value
  try {
    return await blogRead<PostDetail>(`blog/post/${segment.path}`, {
      token: isJwt(access) ? access : null,
      forwardedFor,
    })
  } catch (error) {
    if (isApiNotFound(error)) return null
    throw error
  }
})
