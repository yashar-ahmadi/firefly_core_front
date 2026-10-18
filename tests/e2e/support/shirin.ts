import {
  test as base,
  expect,
  type APIRequestContext,
  type PlaywrightWorkerArgs,
  type TestInfo,
} from '@playwright/test'
import type { Paginated } from '@/lib/api/types/common'
import type { WalletBalance } from '@/lib/api/types/payment'
import type { WithdrawalRequest } from '@/lib/api/types/wallet'
import { demoSession, type DemoAccount } from './session'

// shirin.t (ruling P4-R4: the wallet's account; never sara for money): the wallet specs' shared
// session, logged in once per project per run (`demoSession`; never logged out, never changed),
// and the reads and the one write that undoes a withdrawal: any open request of hers is
// cancelled through the BFF, which puts its money back at once (order digest §3.3.6). The
// wallet journey's guard (`withdrawalGuard`) does it as a fixture, before the test and in its
// teardown, with a request context of its own (the test's browser context is closed by then):
// a test that timed out or crashed still cancels her open request and checks her balance.

export const SHIRIN: DemoAccount & { fullName: string } = {
  email: 'shirin.t@example.com',
  password: 'Firefly@1234',
  fullName: 'شیرین تهرانی',
}

const BFF = { 'X-Requested-With': 'ff' }

/** `test` with `page` signed in as shirin through the project's shared session. */
export const shirinTest = base.extend<object, { shirinState: string }>({
  shirinState: [
    async ({ browser }, provide, { project }) =>
      provide(await demoSession(browser, project, SHIRIN, 'shirin')),
    { scope: 'worker' },
  ],
  storageState: ({ shirinState }, provide) => provide(shirinState),
})

async function data<T>(request: APIRequestContext, path: string): Promise<T> {
  const response = await request.get(`/api/bff/${path}`, { headers: BFF })
  expect(response.ok(), `${path} through the BFF: ${response.status()}`).toBe(true)
  return ((await response.json()) as { data: T }).data
}

export const readWallet = (request: APIRequestContext) => data<WalletBalance>(request, 'wallet/')

/** Her open requests (`requested`: the ones she may cancel). */
export async function openWithdrawals(request: APIRequestContext): Promise<WithdrawalRequest[]> {
  const page = await data<Paginated<WithdrawalRequest>>(
    request,
    'wallet/withdrawal/list/?status=requested&limit=100',
  )
  return page.results
}

/**
 * Cancels every request of hers still `requested` (the money back at once); the number
 * cancelled. A refusal is said, never thrown: the guard must not hide the test's own failure.
 */
export async function cancelOpenWithdrawals(request: APIRequestContext): Promise<number> {
  let cancelled = 0
  for (const open of await openWithdrawals(request)) {
    const response = await request.post(`/api/bff/wallet/withdrawal/${open.uuid}/cancel/`, {
      headers: BFF,
    })
    if (response.ok()) cancelled++
    else console.warn(`[shirin] an open withdrawal was not cancelled: ${response.status()}`)
  }
  return cancelled
}

export interface WithdrawalGuard {
  /** Her session as a request context of its own (never the test's browser context). */
  request: APIRequestContext
  /** Her wallet before the test (an earlier run's open request already cancelled). */
  before: WalletBalance
}

async function guardWithdrawals(
  {
    shirinState,
    playwright,
  }: { shirinState: string; playwright: PlaywrightWorkerArgs['playwright'] },
  provide: (guard: WithdrawalGuard) => Promise<void>,
  info: TestInfo,
): Promise<void> {
  const request = await playwright.request.newContext({
    baseURL: info.project.use.baseURL,
    storageState: shirinState,
  })
  try {
    const left = await cancelOpenWithdrawals(request)
    if (left > 0) console.warn(`[shirin] cancelled ${left} request(s) an earlier run left`)
    const before = await readWallet(request)
    await provide({ request, before })
    const undone = await cancelOpenWithdrawals(request)
    if (undone > 0) console.warn(`[shirin] the guard cancelled ${undone} request(s)`)
    const end = await readWallet(request)
    expect(end.balance, 'her balance is back exactly').toBe(before.balance)
    expect(end.pending_withdrawal_amount, 'nothing of hers held').toBe(
      before.pending_withdrawal_amount,
    )
  } finally {
    await request.dispose()
  }
}

/** `shirinTest` with `withdrawalGuard`; its own time: a teardown after a timeout gets a minute. */
export const shirinWithdrawalTest = shirinTest.extend<{ withdrawalGuard: WithdrawalGuard }>({
  withdrawalGuard: [guardWithdrawals, { timeout: 60_000 }],
})
