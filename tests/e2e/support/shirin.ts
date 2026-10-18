import { test as base, expect, type APIRequestContext } from '@playwright/test'
import type { Paginated } from '@/lib/api/types/common'
import type { WalletBalance } from '@/lib/api/types/payment'
import type { WithdrawalRequest } from '@/lib/api/types/wallet'
import { demoSession, type DemoAccount } from './session'

// shirin.t (ruling P4-R4: the wallet's account; never sara for money): the wallet specs' shared
// session, logged in once per project per run (`demoSession`; never logged out, never changed),
// and the reads and the one write that undoes a withdrawal: any open request of hers is
// cancelled through the BFF (the journey's guard, before and after it), which puts its money
// back at once (order digest §3.3.6).

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
