import {
  test as base,
  expect,
  type APIRequestContext,
  type PlaywrightWorkerArgs,
  type TestInfo,
} from '@playwright/test'
import type { OrderDetail } from '@/lib/api/types/order-detail'

// The order journeys' safety net (Plan 4 Task 10; ruling P4-R4: nothing a journey placed is left
// awaiting payment): a test fixture whose teardown runs however the test ends (an assertion, a
// timeout, a crash), through request contexts of its own (the test's browser context is closed
// by then). The test hands over each order as soon as it exists (`track`): a guest's by its link
// token (cancelled through the link, no session needed; a revoked link answers 404: cancelled
// already), an account's by its code and that account's session file (cancelled from the
// account). A read still on its way when the test ends (the placement's answer, which calls
// `track`) is handed over with `settle` and awaited first, ten seconds at most. Payment attempts
// it opened (`attempt`) are cancelled next. An order the test means to leave as it is (the one
// live receipt upload: under review, which no customer can cancel) is handed over with `keep`
// and only said. The teardown fails when an order could not be cancelled. Link tokens and
// payment uuids are never printed.

export type TrackedOrder =
  | { code: string; token: string }
  /** `storageState`: the account's session file (a demo account's shared session). */
  | { code: string; storageState: string }

export interface OrderGuard {
  /** An order this test placed: cancelled at the end unless it is cancelled already. */
  track: (order: TrackedOrder) => void
  /** A payment attempt this test opened (a guest's, by its uuid): cancelled at the end. */
  attempt: (uuid: string) => void
  /** An order to leave as it is (why: said in the log); never cancelled. */
  keep: (code: string, why: string) => void
  /** Work that may still `track` an order (a response read): awaited before the cancels. */
  settle: (work: Promise<unknown>) => void
}

/** How long the teardown waits for the reads handed to `settle`. */
const SETTLE_MS = 10_000

const BFF = { 'X-Requested-With': 'ff' }

async function cancelByLink(request: APIRequestContext, token: string): Promise<string | null> {
  const response = await request.post(`/api/bff/order/pay/${token}/cancel/`, {
    headers: BFF,
    data: {},
  })
  if (response.ok() || response.status() === 404) return null
  return `link cancel answered ${response.status()}: ${(await response.text()).slice(0, 200)}`
}

async function cancelInAccount(request: APIRequestContext, code: string): Promise<string | null> {
  const read = await request.get(`/api/bff/order/${code}/`, { headers: BFF })
  if (!read.ok()) return `order read answered ${read.status()}`
  if (((await read.json()) as { data: OrderDetail }).data.status === 'cancelled') return null
  const response = await request.post(`/api/bff/order/${code}/cancel/`, { headers: BFF, data: {} })
  if (response.ok()) return null
  return `account cancel answered ${response.status()}: ${(await response.text()).slice(0, 200)}`
}

export async function guardOrders(
  { playwright }: { playwright: PlaywrightWorkerArgs['playwright'] },
  provide: (guard: OrderGuard) => Promise<void>,
  info: TestInfo,
): Promise<void> {
  const orders: TrackedOrder[] = []
  const attempts: string[] = []
  const kept = new Map<string, string>()
  const pending: Promise<unknown>[] = []
  await provide({
    track: (order) => {
      if (!orders.some((known) => known.code === order.code)) orders.push(order)
    },
    attempt: (uuid) => {
      if (!attempts.includes(uuid)) attempts.push(uuid)
    },
    keep: (code, why) => kept.set(code, why),
    settle: (work) => void pending.push(work.catch(() => undefined)),
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([
    Promise.all(pending),
    new Promise((resolve) => (timer = setTimeout(resolve, SETTLE_MS))),
  ])
  clearTimeout(timer)
  const baseURL = info.project.use.baseURL
  const guest = await playwright.request.newContext({ baseURL })
  const failures: string[] = []
  try {
    for (const uuid of attempts) {
      const response = await guest
        .post(`/api/bff/payment/${uuid}/cancel/`, { headers: BFF })
        .catch(() => null)
      // A settled, cancelled or reviewed attempt refuses (409): the order's own cancel decides.
      if (!response?.ok()) console.warn(`[orders] an attempt not cancelled: ${response?.status()}`)
    }
    for (const order of orders) {
      const why = kept.get(order.code)
      if (why) {
        console.warn(`[orders] left order ${order.code} as it is: ${why}`)
        continue
      }
      let problem: string | null
      if ('token' in order) {
        problem = await cancelByLink(guest, order.token).catch((error: unknown) => String(error))
      } else {
        const account = await playwright.request.newContext({
          baseURL,
          storageState: order.storageState,
        })
        problem = await cancelInAccount(account, order.code)
          .catch((error: unknown) => String(error))
          .finally(() => account.dispose())
      }
      if (problem) failures.push(`order ${order.code}: ${problem}`)
    }
  } finally {
    await guest.dispose()
  }
  expect(failures, 'every order the test placed is cancelled (or left on purpose)').toEqual([])
}

/** `test` (a guest's page) with `orders`; its own time: a teardown after a timeout gets a minute. */
export const orderGuardTest = base.extend<{ orders: OrderGuard }>({
  orders: [guardOrders, { timeout: 60_000 }],
})
