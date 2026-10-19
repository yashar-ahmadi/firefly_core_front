import type { APIRequestContext, PlaywrightWorkerArgs, TestInfo } from '@playwright/test'
import type { WalletBalance } from '@/lib/api/types/payment'
import type { AccountData } from './account-data'
import { withAccountData } from './account-guard'
import { guardOrders, type OrderGuard } from './order-guard'
import { readWallet, shirinTest } from './shirin'

// shirin's order journeys' safety net (Plan 4 Task 10; ruling P4-R4: her account for the
// signed-in purchases, never sara's): her cart and address book kept safe around the test
// (support/account-guard.ts: a snapshot, then, however the test ends, restored exactly), through
// a request context of her own shared session (no login of its own; still open at the teardown),
// with her wallet read before the test; and `orders` (support/order-guard.ts) for an order she
// placed.

export interface ShirinGuard {
  /** Her session as a request context of its own (never the test's browser context). */
  request: APIRequestContext
  /** Her cart and address book before the test wrote anything. */
  before: AccountData
  /** Her wallet before the test. */
  wallet: WalletBalance
  /** Her shared session's file (an order of hers handed to `orders.track`). */
  storageState: string
}

async function guardShirin(
  {
    shirinState,
    playwright,
  }: { shirinState: string; playwright: PlaywrightWorkerArgs['playwright'] },
  provide: (guard: ShirinGuard) => Promise<void>,
  info: TestInfo,
): Promise<void> {
  const request = await playwright.request.newContext({
    baseURL: info.project.use.baseURL,
    storageState: shirinState,
  })
  try {
    await withAccountData(request, info, { who: 'shirin', file: 'shirin' }, async (before) => {
      const wallet = await readWallet(request)
      await provide({ request, before, wallet, storageState: shirinState })
    })
  } finally {
    await request.dispose()
  }
}

/** `shirinTest` with `shirin` and `orders`; each teardown gets a minute of its own. */
export const shirinGuardedTest = shirinTest.extend<{ shirin: ShirinGuard; orders: OrderGuard }>({
  shirin: [guardShirin, { timeout: 60_000 }],
  orders: [guardOrders, { timeout: 60_000 }],
})
