import type { Page } from '@playwright/test'

/** The dev backend's picture paths: its pictures and placeholders may be missing in dev. */
const MEDIA_PATH = /^\/(?:media|static)\//

/**
 * Routes later plans build, which the shell already links to (the checkout; homepage posts, the
 * registration terms' page links, my comments' subjects): a visit or a router prefetch there
 * answers 404 until the route exists. Remove each one as its route lands (Plan 3 built the auth
 * and every account page; Plan 4 the cart, then the checkout; blog and content pages: the
 * content plan).
 */
const NOT_YET_BUILT = /^\/(?:checkout|blog|page)\//

const NOT_FOUND = /^Failed to load resource: the server responded with a status of 404\b/

function pathOf(url: string): string | null {
  try {
    return new URL(url).pathname
  } catch {
    return null
  }
}

/**
 * Whether a console error is one the dev environment is expected to log: a 404 for a backend
 * picture (a path under `/media/` or `/static/`, so `/_next/static/` chunks are still reported)
 * or for a route not built yet. Any other failure there (a 5xx, a refused connection) is
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
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const url = message.location().url
    if (isExpectedFailure(message.text(), url)) return
    errors.push(url ? `${message.text()} (${url})` : message.text())
  })
  return errors
}
