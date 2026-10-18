import { test as base, type APIRequestContext, type TestInfo } from '@playwright/test'
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
// ends, restores them exactly (support/kamran-data.ts), then logs out (one more attempt). It runs
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

export const kamranTest = base.extend<{ kamran: KamranGuard }>({
  kamran: async ({ context, baseURL }, provide, info) => {
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
      await restoreKamran(request, before)
      await rm(file)
    } finally {
      const response = await request
        .post(`${origin}/api/bff/account/auth/logout/`, {
          headers: { 'X-Requested-With': 'ff', Origin: origin },
        })
        .catch((error: unknown) => error)
      if (response instanceof Error) console.warn('[kamran-guard] logout:', response.message)
    }
  },
})
