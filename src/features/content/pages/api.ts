import 'server-only'
import { cookies } from 'next/headers'
import { cache } from 'react'
import { isKnownMissing, rememberMissing } from '@/features/catalog/loaders/missing'
import { oneSegment, orRememberedNotFound, read, visitorIp } from '@/features/catalog/loaders/read'
import { ApiError, isApiNotFound } from '@/lib/api/errors'
import { apiFetch } from '@/lib/api/server'
import type { Paginated } from '@/lib/api/types/common'
import type { PageCard, PageDetail } from '@/lib/api/types/page'
import { COOKIE } from '@/lib/auth/cookies'
import { isJwt } from '@/lib/bff/session'

/**
 * A content page's reads (content digest §2, §3). Three paths, kept apart:
 *
 * - **everyone's page**: anonymous (no token, no visitor IP), so one Data Cache entry (300 s,
 *   digest §1.4) serves every visitor; an unknown slug or a draft is the API's 404, remembered a
 *   minute in process memory (`orRememberedNotFound`; Next caches only 200s);
 * - **a page for signed-in visitors only** (`requires_login`): the anonymous read answers 401
 *   (remembered a minute too, so a guest costs no API call); then the visitor's own session reads
 *   it with their token and IP, uncached, or, without one (or with a token the API refuses), the
 *   page sends them to sign in (`SIGN_IN`). The proxy refreshes an expiring token before the page
 *   renders, so a refused one means the session is over;
 * - **a staff preview of a draft**: only after that 404, and only for a visitor with a session
 *   (a JWT-shaped `ff_at`), the page is read again with their token and IP, uncached
 *   (`apiFetch` never caches a call with a token: digest §0 item 11). A staff account gets the
 *   draft (`is_unpublished`); anyone else gets the same 404.
 *
 * So a public page never carries `Authorization` and is never read twice, and a user token's
 * answer never reaches a cache. `cache()` shares each read between `generateMetadata` and the
 * page.
 */

/** On every page read: `revalidateTag('pages')` refreshes them all. */
export const PAGES_TAG = 'pages'
const PAGE_REVALIDATE = 300
/** The aside's list: every page there is (the API's maximum page size). */
const LIST_LIMIT = 100

/** The page is for signed-in visitors only and this visitor is not one: send them to login. */
export const SIGN_IN = 'sign-in'

/** What a page read gives: the page, `SIGN_IN`, or null when there is none to show. */
export type PageRead = PageDetail | typeof SIGN_IN | null

type Segment = NonNullable<ReturnType<typeof oneSegment>>

/** What the anonymous read of a login-only page gives (its 401). */
const LOGIN_ONLY = Symbol('login-only')

/** The memory key of a page whose anonymous read answered 401 (`./missing.ts`'s list). */
const loginOnlyKey = (segment: Segment) => `page-login-only:${segment.text}`

/**
 * Whether the API refused the read for want of a signed-in visitor: its 401 for this page
 * (`not_authenticated` without a token, `token_not_valid` with one it refuses), never the
 * storefront's own key refused (`api_key_missing`, `api_key_invalid`: a deployment fault, thrown).
 */
function isLoginRequired(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401 && !error.code.startsWith('api_key_')
}

function publishedPage(segment: Segment): Promise<PageDetail | typeof LOGIN_ONLY | null> {
  if (isKnownMissing(loginOnlyKey(segment))) return Promise.resolve(LOGIN_ONLY)
  return orRememberedNotFound(`page:${segment.text}`, async () => {
    try {
      return await read<PageDetail>(`pages/${segment.path}`, {
        revalidate: PAGE_REVALIDATE,
        tags: [`page:${segment.text}`, PAGES_TAG],
      })
    } catch (error) {
      if (!isLoginRequired(error)) throw error
      rememberMissing(loginOnlyKey(segment))
      return LOGIN_ONLY
    }
  })
}

/** The visitor's access token when it has a token's shape, else null. */
async function accessToken(): Promise<string | null> {
  const access = (await cookies()).get(COOKIE.access)?.value
  return isJwt(access) ? access : null
}

/**
 * The page read with the visitor's own token, never cached: null on the API's 404 (gone, or a
 * draft for anyone but staff), `SIGN_IN` on its 401 (`not_authenticated`, `token_not_valid`);
 * other failures are thrown.
 */
async function personalPage(segment: Segment, token: string): Promise<PageRead> {
  try {
    const { data } = await apiFetch<PageDetail>(`pages/${segment.path}`, {
      token,
      forwardedFor: await visitorIp(),
    })
    return data
  } catch (error) {
    if (isApiNotFound(error)) return null
    if (isLoginRequired(error)) return SIGN_IN
    throw error
  }
}

/** The draft a staff session may preview, read with its token, never cached; else null. */
async function previewedPage(segment: Segment): Promise<PageDetail | null> {
  const token = await accessToken()
  if (token === null) return null
  const page = await personalPage(segment, token)
  return page === SIGN_IN ? null : page
}

/** A login-only page for this visitor: with their session, else `SIGN_IN`. */
async function signedInPage(segment: Segment): Promise<PageRead> {
  const token = await accessToken()
  return token === null ? SIGN_IN : personalPage(segment, token)
}

/**
 * The page, `SIGN_IN` (a page for signed-in visitors only, and this one is not), or null when
 * there is none to show: the API's 404 (missing, or a draft for anyone but staff), a slug that
 * cannot be one segment, or `list` (the API's pages list, reserved). Persian slugs are
 * percent-encoded once. Other failures are thrown (the error page).
 */
export const getPage = cache(async (slug: string): Promise<PageRead> => {
  const segment = oneSegment(slug)
  if (segment === null || segment.text === 'list') return null
  const published = await publishedPage(segment)
  if (published === LOGIN_ONLY) return signedInPage(segment)
  return published ?? previewedPage(segment)
})

/**
 * Every published page (`pages/list/?limit=100`, by title; login-only ones too, flagged),
 * cached like the pages. Never throws: [] on a failure (logged), and the `with_sidebar` aside
 * then shows nothing.
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
