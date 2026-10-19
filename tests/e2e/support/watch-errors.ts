import type { Page } from '@playwright/test'

/** The dev backend's picture paths: its pictures and placeholders may be missing in dev. */
const MEDIA_PATH = /^\/(?:media|static)\//

/**
 * Routes later plans build, which the shell already links to (the registration terms' page
 * links, my comments' subjects, search rows): a visit or a router prefetch there answers 404
 * until the route exists. Remove each one as its route lands (Plan 3 built the auth and every
 * account page; Plan 4 the cart, the checkout, the payment link and the card transfer; Plan 5
 * Task 1 the blog home and its category pages, Task 2 a post's page). Left: content pages,
 * `/page/<slug>/` (Task 3).
 */
const NOT_YET_BUILT = /^\/page\//

const NOT_FOUND = /^Failed to load resource: the server responded with a status of 404\b/
/** A failed request's console line, and its status. */
const FAILED = /^Failed to load resource: the server responded with a status of (\d{3})\b/

/** Per watched page: what it collected, and the failed requests the test accounted for. */
const watched = new WeakMap<object, { errors: string[]; forgiven: Set<string> }>()

/** A failed request the test accounted for: its status and URL. */
const forgivenKey = (status: number | string, url: string) => `${status} ${url}`

/** The status of a failed request's console line, or null for any other line. */
function failedStatus(text: string): string | null {
  return FAILED.exec(text)?.[1] ?? null
}

const consoleError = (text: string, url: string) => (url ? `${text} (${url})` : text)

/**
 * The path a failed request was for: a picture through Next's image optimizer counts as the
 * picture it was asked for (`/_next/image/?url=/media/…`).
 */
function pathOf(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.pathname.replace(/\/$/, '') !== '/_next/image') return parsed.pathname
    const source = parsed.searchParams.get('url')
    return source?.startsWith('/') ? new URL(source, parsed.origin).pathname : parsed.pathname
  } catch {
    return null
  }
}

/**
 * Whether a console error is one the dev environment is expected to log: a 404 for a backend
 * picture (a path under `/media/` or `/static/`, also through the image optimizer, so
 * `/_next/static/` chunks are still reported) or for a route not built yet. Any other failure there (a 5xx, a refused connection) is
 * reported. Pure, for the unit test.
 */
export function isExpectedFailure(text: string, url: string): boolean {
  const path = pathOf(url)
  if (path === null || !NOT_FOUND.test(text)) return false
  return MEDIA_PATH.test(path) || NOT_YET_BUILT.test(path)
}

/**
 * Page errors and console errors seen while the page runs: hydration mismatches included, also
 * the production build's minified ones («Minified React error #418»). Only `isExpectedFailure`
 * messages are let through; any other failed request (a 5xx page, a Next chunk, a 404 script)
 * is an error.
 */
export function watchErrors(page: Page): string[] {
  const errors: string[] = []
  const forgiven = new Set<string>()
  watched.set(page, { errors, forgiven })
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const url = message.location().url
    if (isExpectedFailure(message.text(), url)) return
    const status = failedStatus(message.text())
    if (status && forgiven.has(forgivenKey(status, url))) return
    errors.push(consoleError(message.text(), url))
  })
  return errors
}

/**
 * A request's failure the test accounted for, by its status (500 by default: a cart write that
 * met the dev database's lock and was repeated, support/cart-write.ts; a 503 the dev backend
 * answers by design, such as `gateway_not_configured`): its console error, logged already or
 * still to come, is not one of the page's. Nothing for a page nobody watches.
 */
export function forgiveFailure(page: object, url: string, status = 500): void {
  const entry = watched.get(page)
  if (!entry) return
  entry.forgiven.add(forgivenKey(status, url))
  for (let index = entry.errors.length - 1; index >= 0; index--) {
    const error = entry.errors[index]!
    if (error.endsWith(`(${url})`) && failedStatus(error) === String(status)) {
      entry.errors.splice(index, 1)
    }
  }
}
