import 'server-only'
import { cookies } from 'next/headers'
import { cache } from 'react'
import { oneSegment, orRememberedNotFound, read, visitorIp } from '@/features/catalog/loaders/read'
import { isApiNotFound } from '@/lib/api/errors'
import { apiFetch } from '@/lib/api/server'
import type { Paginated } from '@/lib/api/types/common'
import type { PageCard, PageDetail } from '@/lib/api/types/page'
import { COOKIE } from '@/lib/auth/cookies'
import { isJwt } from '@/lib/bff/session'

/**
 * A content page's reads (content digest §3). Two paths, kept apart:
 *
 * - **everyone's page**: anonymous (no token, no visitor IP), so one Data Cache entry (300 s,
 *   digest §1.4) serves every visitor; an unknown slug or a draft is the API's 404, remembered a
 *   minute in process memory (`orRememberedNotFound`; Next caches only 200s);
 * - **a staff preview of a draft**: only after that 404, and only for a visitor with a session
 *   (a JWT-shaped `ff_at`), the page is read again with their token and IP, uncached
 *   (`apiFetch` never caches a call with a token: digest §0 item 11). A staff account gets the
 *   draft (`is_unpublished`); anyone else gets the same 404.
 *
 * So a published page never carries `Authorization` and is never read twice, and a user token's
 * answer never reaches a cache. `cache()` shares each read between `generateMetadata` and the
 * page.
 */

/** On every page read: `revalidateTag('pages')` refreshes them all. */
export const PAGES_TAG = 'pages'
const PAGE_REVALIDATE = 300
/** The aside's list: every page there is (the API's maximum page size). */
const LIST_LIMIT = 100

type Segment = NonNullable<ReturnType<typeof oneSegment>>

function publishedPage(segment: Segment): Promise<PageDetail | null> {
  return orRememberedNotFound(`page:${segment.text}`, () =>
    read<PageDetail>(`pages/${segment.path}`, {
      revalidate: PAGE_REVALIDATE,
      tags: [`page:${segment.text}`, PAGES_TAG],
    }),
  )
}

/** The draft a staff session may preview, read with its token, never cached; else null. */
async function previewedPage(segment: Segment): Promise<PageDetail | null> {
  const access = (await cookies()).get(COOKIE.access)?.value
  if (!isJwt(access)) return null
  try {
    const { data } = await apiFetch<PageDetail>(`pages/${segment.path}`, {
      token: access,
      forwardedFor: await visitorIp(),
    })
    return data
  } catch (error) {
    if (isApiNotFound(error)) return null
    throw error
  }
}

/**
 * The page, or null when there is none to show: the API's 404 (missing, or a draft for anyone
 * but staff), a slug that cannot be one segment, or `list` (the API's pages list, reserved).
 * Persian slugs are percent-encoded once. Other failures are thrown (the error page).
 */
export const getPage = cache(async (slug: string): Promise<PageDetail | null> => {
  const segment = oneSegment(slug)
  if (segment === null || segment.text === 'list') return null
  return (await publishedPage(segment)) ?? previewedPage(segment)
})

/**
 * The published page only, never a staff preview: for a page shown inside another route (the
 * contact page shows `contact-us`'s content above its form), so a visitor with a session never
 * costs a second, uncached read there. null as `getPage` (a draft included).
 */
export const getPublishedPage = cache(async (slug: string): Promise<PageDetail | null> => {
  const segment = oneSegment(slug)
  if (segment === null || segment.text === 'list') return null
  return publishedPage(segment)
})

/**
 * Every published page (`pages/list/?limit=100`, by title), cached like the pages. Never throws:
 * [] on a failure (logged), and the `with_sidebar` aside then shows nothing.
 */
export const getPageCards = cache(async (): Promise<PageCard[]> => {
  try {
    const list = await read<Paginated<PageCard>>('pages/list', {
      query: { limit: LIST_LIMIT },
      revalidate: PAGE_REVALIDATE,
      tags: [PAGES_TAG],
    })
    return list.results
  } catch (error) {
    console.error('[pages] getPageCards failed:', (error as Error).message)
    return []
  }
})
