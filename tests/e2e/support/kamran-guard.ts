import {
  test as base,
  expect,
  type APIRequestContext,
  type BrowserContext,
  type TestInfo,
} from '@playwright/test'
import type { AccountData } from './account-data'
import { withAccountData } from './account-guard'
import { cancelKamranOrder } from './kamran-order'
import { KAMRAN, logIn } from './session'

// The signed-in checkout and orders journeys' safety net (Plan 4 Tasks 2 and 8, ruling P4-R4:
// k.yazdi, never sara): a test fixture that signs the test's browser context in as kamran (one
// auth attempt) and keeps his cart and address book safe around the test (support/
// account-guard.ts: an earlier run's leftovers put back, a snapshot, and after the test, however
// it ends, the data settled and restored exactly), cancels every order of his the test handed
// over (`track`; cancelled already is fine), then logs out (one more attempt; a non-2xx is said).
// It runs in the `journeys` project only (one worker, after the device projects).

export interface KamranGuard {
  /** His session: the test's own browser context's requests (the cookies the page uses). */
  request: APIRequestContext
  /** His cart and address book before the test wrote anything. */
  before: AccountData
  /** An order of his the test placed: cancelled at the end, however the test ends. */
  track: (code: string) => void
}

/** Logs the session out; a failure or a non-2xx answer is said (the session then just expires). */
async function logOut(request: APIRequestContext, origin: string): Promise<void> {
  const response = await request
    .post(`${origin}/api/bff/account/auth/logout/`, {
      headers: { 'X-Requested-With': 'ff', Origin: origin },
    })
    .catch((error: unknown) => (error instanceof Error ? error : new Error(String(error))))
  if (response instanceof Error) console.warn('[kamran-guard] logout:', response.message)
  else if (!response.ok()) console.warn(`[kamran-guard] logout answered ${response.status()}`)
}

async function guardKamran(
  { context, baseURL }: { context: BrowserContext; baseURL: string | undefined },
  provide: (guard: KamranGuard) => Promise<void>,
  info: TestInfo,
): Promise<void> {
  const origin = baseURL ?? 'http://localhost:3000'
  await logIn(context, origin, KAMRAN)
  const { request } = context
  const placed: string[] = []
  const track = (code: string) => void placed.push(code)
  const left: string[] = []
  try {
    await withAccountData(request, info, { who: 'k.yazdi', file: 'kamran' }, (before) =>
      provide({ request, before, track }),
    )
  } finally {
    for (const code of placed) if (!(await cancelKamranOrder(request, code))) left.push(code)
    await logOut(request, origin)
  }
  expect(left, 'every order of his the test placed is cancelled').toEqual([])
}

/** Its own time: a restore after a test that timed out still gets a minute. */
export const kamranTest = base.extend<{ kamran: KamranGuard }>({
  kamran: [guardKamran, { timeout: 60_000 }],
})
