import type { Page } from '@playwright/test'

/** The dev backend's picture paths: its pictures and placeholders may fail to load in dev. */
const MEDIA_PATH = /^\/(?:media|static)\//

/**
 * Routes later plans build, which the shell already links to (cart and login; homepage posts,
 * search results): a visit or a router prefetch there answers 404 until the route exists.
 * Remove each one as its route lands (auth and account: Plan 3; cart and checkout: Plan 4; blog
 * and content pages: the content plan).
 */
const NOT_YET_BUILT = /^\/(?:login|register|forgot-password|account|cart|checkout|blog|page)\//

const FAILED_LOAD = /^Failed to load resource/
const NOT_FOUND = /^Failed to load resource: the server responded with a status of 404\b/

function pathOf(url: string): string | null {
  try {
    return new URL(url).pathname
  } catch {
    return null
  }
}

/**
 * Whether a console error is one the dev environment is expected to log: a failed load of a
 * backend picture (a path under `/media/` or `/static/`, so `/_next/static/` chunks are still
 * reported), or a 404 from a route not built yet. Pure, for the unit test.
 */
export function isExpectedFailure(text: string, url: string): boolean {
  const path = pathOf(url)
  if (path === null || !FAILED_LOAD.test(text)) return false
  return MEDIA_PATH.test(path) || (NOT_FOUND.test(text) && NOT_YET_BUILT.test(path))
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
