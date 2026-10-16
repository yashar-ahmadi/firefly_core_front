import type { ConsoleMessage, Page } from '@playwright/test'

/** The dev backend has no media files: its pictures and placeholders may fail to load. */
const MEDIA_FILE = /\/(?:media|static)\//

/**
 * Routes later plans build, which the shell already links to (header search, cart and login;
 * homepage posts): a visit or a router prefetch there answers 404 until the route exists.
 * Remove each one as its route lands (search: Task 10; compare: Task 9; auth and account:
 * Plan 3; cart and checkout: Plan 4; blog and content pages: the content plan).
 */
const NOT_YET_BUILT =
  /^\/(?:search|compare|login|register|forgot-password|account|cart|checkout|blog|page)\//

const NOT_FOUND = /^Failed to load resource: the server responded with a status of 404\b/

/** A failed load of a backend picture. */
function isMissingMedia(message: ConsoleMessage): boolean {
  return /^Failed to load resource/.test(message.text()) && MEDIA_FILE.test(message.location().url)
}

/** A 404 from a route that does not exist yet (a visit, or the router's prefetch of a link). */
function isPendingRoute(message: ConsoleMessage): boolean {
  if (!NOT_FOUND.test(message.text())) return false
  try {
    return NOT_YET_BUILT.test(new URL(message.location().url).pathname)
  } catch {
    return false
  }
}

/**
 * Page errors and console errors seen while the page runs: hydration mismatches included, also
 * the production build's minified ones («Minified React error #418»). Let through only failed
 * loads of `/media/` and `/static/` files, and 404s from routes not built yet; any other failed
 * request (a 5xx page or chunk, a 404 script) is an error.
 */
export function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    if (isMissingMedia(message) || isPendingRoute(message)) return
    const url = message.location().url
    errors.push(url ? `${message.text()} (${url})` : message.text())
  })
  return errors
}
