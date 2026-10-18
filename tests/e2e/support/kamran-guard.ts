import {
  test as base,
  expect,
  type APIRequestContext,
  type BrowserContext,
  type TestInfo,
} from '@playwright/test'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  readKamranData,
  removeCheckoutMarkers,
  restoreKamran,
  type KamranData,
} from './kamran-data'
import { KAMRAN, logIn } from './session'

// The signed-in checkout journey's safety net (Plan 4 Task 2, ruling P4-R4: k.yazdi, never
// sara): a test fixture that signs the test's browser context in as kamran (one auth attempt),
// puts back what an earlier run left (a snapshot on disk, deleted only once a restore is
// verified; marker addresses), reads his cart and address book, and after the test, however it
// ends, waits for them to settle (a write the page still had on its way), restores them exactly
// (support/kamran-data.ts), then logs out (one more attempt; a non-2xx is said). It runs
// in the `journeys` project only (one worker, after the device projects).

export interface KamranGuard {
  /** His session: the test's own browser context's requests (the cookies the page uses). */
  request: APIRequestContext
  /** His cart and address book before the test wrote anything. */
  before: KamranData
}

/** Outside the output folder (emptied at every run's start): it must outlive a crashed run. */
function snapshotFile(info: TestInfo): string {
  return path.join(info.project.testDir, '.state', `kamran-${info.project.name}.json`)
}

async function restoreLeftover(request: APIRequestContext, file: string): Promise<void> {
  let left: KamranData
  try {
    left = JSON.parse(await readFile(file, 'utf8')) as KamranData
  } catch {
    return
  }
  try {
    await restoreKamran(request, left)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(
      `An earlier run left a snapshot of k.yazdi's cart and address book that cannot be put ` +
        `back: ${file}\nCheck them through the BFF, then delete that file and run again.\n${reason}`,
      { cause: error },
    )
  }
  await rm(file)
}

/**
 * Resolves once two reads in a row, half a second apart, find the same data: a write the page
 * still had on its way when the test ended (a choice it makes by itself) lands before the
 * restore, not after it.
 */
async function settled(request: APIRequestContext): Promise<void> {
  let last = ''
  await expect
    .poll(
      async () => {
        const now = JSON.stringify(await readKamranData(request))
        const same = now === last
        last = now
        return same
      },
      { message: 'k.yazdi’s data kept changing', timeout: 15_000, intervals: [500] },
    )
    .toBe(true)
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
  const file = snapshotFile(info)
  try {
    await restoreLeftover(request, file)
    await removeCheckoutMarkers(request)
    const before = await readKamranData(request)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, JSON.stringify(before))
    await provide({ request, before })
    try {
      await settled(request)
    } finally {
      // Whatever the wait came to, his data goes back (a failed wait is still reported); the
      // snapshot goes once the restore is verified.
      await restoreKamran(request, before)
      await rm(file)
    }
  } finally {
    await logOut(request, origin)
  }
}

/** Its own time: a restore after a test that timed out still gets a minute. */
export const kamranTest = base.extend<{ kamran: KamranGuard }>({
  kamran: [guardKamran, { timeout: 60_000 }],
})
