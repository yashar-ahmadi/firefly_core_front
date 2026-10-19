// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CACHES, HOME_COPY, shop, SOURCE } from './sw-offline-support'
import { navigation, served, worker } from './sw-scope'

// The age of an offline copy in `/sw.js` (Plan 5 Task 7, carried from Task 6's review): a visit to
// a kept page asks for a new anonymous copy once the kept one is 10 minutes old. The age is
// measured on the worker's own clock, stamped on the copy when it is kept, never from the
// server's `Date` against the device's clock: a device clock running ahead made every visit ask
// again, one running behind kept a copy for as long as the clocks are apart.

const T0 = Date.parse('2026-10-19T08:00:00Z')
const MINUTE = 60_000
const HOUR = 60 * MINUTE

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
})

afterEach(() => {
  vi.useRealTimers()
})

/** A worker that kept its copies at T0, the server's clock `serverClockAheadMs` off the device's. */
async function installed(serverClockAheadMs = 0) {
  const sw = worker(SOURCE, { network: shop({ online: true }, { serverClockAheadMs }) })
  await sw.fire('install')
  await sw.fire('activate')
  return sw
}

/** How many times the worker has asked for the home page's anonymous copy. */
const copyRequests = (sw: ReturnType<typeof worker>) =>
  sw.requests.filter(
    (request) => request.headers.has('x-ff-offline') && new URL(request.url).pathname === '/',
  ).length

/** A visit to the home page, `after` ms past T0 on the device's clock. */
async function visitAt(sw: ReturnType<typeof worker>, after: number) {
  vi.setSystemTime(T0 + after)
  await sw.request(navigation('/'))
}

describe('the age of a kept copy', () => {
  it('the copy is stamped with the worker’s own time when it is kept', async () => {
    const sw = await installed(-2 * HOUR)
    const copy = await (await sw.caches.open(CACHES.pages)).match('/')
    expect(copy?.headers.get('x-ff-kept-at')).toBe(String(T0))
    expect(await copy?.text()).toBe(HOME_COPY)
    // The server's headers are kept as they came.
    expect(copy?.headers.get('x-ff-offline')).toBe('snapshot')
  })

  it.each([
    ['ahead of the server’s', -2 * HOUR],
    ['behind the server’s', 2 * HOUR],
    ['on time', 0],
  ])('a device clock %s: asked for again only after 10 minutes', async (_, serverAhead) => {
    const sw = await installed(serverAhead)
    expect(copyRequests(sw)).toBe(1)
    await visitAt(sw, MINUTE)
    await visitAt(sw, 9 * MINUTE)
    expect(copyRequests(sw), 'a fresh copy is asked for again').toBe(1)
    await visitAt(sw, 11 * MINUTE)
    expect(copyRequests(sw), 'a copy over 10 minutes old is kept as it was').toBe(2)
    // The new copy counts from when it was kept.
    await visitAt(sw, 12 * MINUTE)
    expect(copyRequests(sw)).toBe(2)
  })

  it('a copy without the stamp (kept by an earlier worker): asked for again on the next visit', async () => {
    const sw = await installed()
    const cache = await sw.caches.open(CACHES.pages)
    await cache.put(
      '/',
      served(HOME_COPY, {
        headers: { date: new Date(T0).toUTCString(), 'x-ff-offline': 'snapshot' },
      }),
    )
    await visitAt(sw, MINUTE)
    expect(copyRequests(sw)).toBe(2)
  })

  it('the device’s clock set back after keeping (a negative age): asked for again', async () => {
    const sw = await installed()
    await visitAt(sw, -HOUR)
    expect(copyRequests(sw)).toBe(2)
  })
})
