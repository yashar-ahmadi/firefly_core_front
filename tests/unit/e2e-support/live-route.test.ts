// @vitest-environment node
import type { Route } from '@playwright/test'
import { describe, expect, it, vi } from 'vitest'
import { fulfilUnlessDropped, liveJson } from '../../e2e/support/live-route'

// A route handler that reads the live answer (`route.fetch()`, then its JSON) may find the page
// dropped the request meanwhile: Playwright has disposed of the response («Response has been
// disposed», the cause of the Plan 4 orders spec's mobile failure). That is no failure of the
// test: nobody waits for an answer any more. Anything else still is.

function routeWith(fetch: () => Promise<unknown>, fulfill = vi.fn(async () => {})): Route {
  return { fetch, fulfill } as unknown as Route
}

const answer = (json: () => Promise<unknown>) => async () => ({ json })

describe('liveJson', () => {
  it('the live response and its body', async () => {
    const route = routeWith(answer(async () => ({ data: { results: [] } })))
    expect((await liveJson(route))?.body).toEqual({ data: { results: [] } })
  })

  it.each([
    'apiResponse.json: Response has been disposed',
    'route.fetch: Target page, context or browser has been closed',
    'route.fetch: Request context disposed.',
  ])('null when the page dropped the request: «%s»', async (message) => {
    const failing = routeWith(answer(async () => Promise.reject(new Error(message))))
    expect(await liveJson(failing)).toBeNull()
    expect(await liveJson(routeWith(() => Promise.reject(new Error(message))))).toBeNull()
  })

  it('any other failure is the test’s: thrown as it came', async () => {
    const broken = routeWith(answer(async () => Promise.reject(new SyntaxError('Unexpected <'))))
    await expect(liveJson(broken)).rejects.toThrow('Unexpected <')
  })
})

describe('fulfilUnlessDropped', () => {
  it('answers the route', async () => {
    const fulfill = vi.fn(async () => {})
    await fulfilUnlessDropped(
      routeWith(async () => ({}), fulfill),
      { status: 200 },
    )
    expect(fulfill).toHaveBeenCalledExactlyOnceWith({ status: 200 })
  })

  it('a dropped request is let go quietly; another failure is thrown', async () => {
    const dropped = vi.fn(async () => Promise.reject(new Error('route.fulfill: Target closed')))
    await expect(
      fulfilUnlessDropped(
        routeWith(async () => ({}), dropped),
        {},
      ),
    ).resolves.toBeUndefined()
    const other = vi.fn(async () => Promise.reject(new Error('Route is already handled!')))
    await expect(
      fulfilUnlessDropped(
        routeWith(async () => ({}), other),
        {},
      ),
    ).rejects.toThrow('already handled')
  })
})
