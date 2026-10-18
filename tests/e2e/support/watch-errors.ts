import type { Page } from '@playwright/test'

/** The dev backend's picture paths: its pictures and placeholders may be missing in dev. */
const MEDIA_PATH = /^\/(?:media|static)\//

/**
 * Routes later plans build, which the shell already links to (homepage posts, the registration
 * terms' page links, my comments' subjects): a visit or a router prefetch there answers 404
 * until the route exists. Remove each one as its route lands (Plan 3 built the auth and every
 * account page; Plan 4 the cart and the checkout; blog and content pages: the content plan).
 */
const NOT_YET_BUILT = /^\/(?:blog|page)\//

const NOT_FOUND = /^Failed to load resource: the server responded with a status of 404\b/
const SERVER_ERROR = /^Failed to load resource: the server responded with a status of 500\b/

/** Per watched page: what it collected, and the failed requests the test accounted for. */
const watched = new WeakMap<object, { errors: string[]; forgiven: Set<string> }>()

const consoleError = (text: string, url: string) => (url ? `${text} (${url})` : text)

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
  const forgiven = new Set<string>()
  watched.set(page, { errors, forgiven })
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const url = message.location().url
    if (isExpectedFailure(message.text(), url)) return
    if (forgiven.has(url) && SERVER_ERROR.test(message.text())) return
    errors.push(consoleError(message.text(), url))
  })
  return errors
}

/**
 * A request's 500 the test accounted for (a cart write that met the dev database's lock and was
 * repeated, support/cart-write.ts): its console error, logged already or still to come, is not
 * one of the page's. Nothing for a page nobody watches.
 */
export function forgiveFailure(page: object, url: string): void {
  const entry = watched.get(page)
  if (!entry) return
  entry.forgiven.add(url)
  for (let index = entry.errors.length - 1; index >= 0; index--) {
    const error = entry.errors[index]!
    if (error.endsWith(`(${url})`) && SERVER_ERROR.test(error)) entry.errors.splice(index, 1)
  }
}
