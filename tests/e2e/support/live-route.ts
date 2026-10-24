import type { APIResponse, Page, Route } from '@playwright/test'

/**
 * What Playwright says of a request the page dropped while a route handler was still answering
 * it (a read cancelled for a newer one, a navigation): the live response is disposed, the route
 * closed.
 */
const DROPPED = /disposed|has been closed|Target (?:page, context or browser )?closed|aborted/i

/**
 * A route handler's live answer: the response `route.fetch()` got and its JSON body, or null when
 * the page dropped the request meanwhile (its response is disposed before it could be read; no
 * one waits for an answer any more). Any other failure is thrown as it came.
 */
export async function liveJson<T>(
  route: Route,
): Promise<{ response: APIResponse; body: T } | null> {
  try {
    const response = await route.fetch()
    return { response, body: (await response.json()) as T }
  } catch (error) {
    if (error instanceof Error && DROPPED.test(error.message)) return null
    throw error
  }
}

/**
 * Answers `route` with `answer`, unless the page dropped the request meanwhile: then the route is
 * let go (aborted), quietly.
 */
export async function fulfilUnlessDropped(
  route: Route,
  answer: Parameters<Route['fulfill']>[0],
): Promise<void> {
  try {
    await route.fulfill(answer)
  } catch (error) {
    if (!(error instanceof Error && DROPPED.test(error.message))) throw error
  }
}

/**
 * An auto fixture for a spec whose route handlers fetch live (`liveJson`, `route.fetch()`): after
 * the test, however it ended, the page's handlers still answering finish against a live page
 * before it closes. One still fetching when the test ends would otherwise fail «Test ended»,
 * an error outside any test that fails the run (Task 9's final regression). Use as
 * `test.extend<{ routesSettle: void }>({ routesSettle: [settleRoutes, { auto: true }] })`.
 */
export async function settleRoutes({ page }: { page: Page }, provide: () => Promise<void>) {
  // (The fixture's `use` callback, named apart from React's `use`: the hooks lint rule.)
  await provide()
  await page.unrouteAll({ behavior: 'wait' })
}
