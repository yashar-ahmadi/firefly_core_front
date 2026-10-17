import {
  test as base,
  expect,
  type APIRequestContext,
  type Browser,
  type PlaywrightWorkerArgs,
  type TestInfo,
} from '@playwright/test'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { readSaraData, removeMarkers, restoreSara, type SaraData } from './sara-data'
import { saraSession, signedInTest } from './session'

// The write journeys' safety net (Plan 3 Task 10): a test fixture, so sara's data is put back
// whatever ends the test (an assertion, a timeout, a crash in the page). Before the test it:
// 1. puts back the snapshot an earlier run left (it stopped after a write and before its own
//    restore: the snapshot is only deleted once a restore is verified);
// 2. takes out the journeys' markers left without a snapshot (support/sara-data.ts `MARKERS`);
// 3. reads sara's data and writes that snapshot, before the test's first write.
// After the test (the fixture's teardown, with its own request context: the test's browser
// context is closed by then), it waits for the data to stop moving (a cart merge still on its
// way), restores the snapshot, checks it and deletes the snapshot file.

export interface SaraGuard {
  /** Sara's shared session as a request context of its own (never the test's browser context). */
  request: APIRequestContext
  /** Her data before the test wrote anything (markers of earlier runs already gone). */
  before: SaraData
}

/** Outside the output folder (emptied at every run's start): it must outlive a crashed run. */
function snapshotFile(info: TestInfo): string {
  return path.join(info.project.testDir, '.state', `sara-${info.project.name}.json`)
}

async function readSnapshot(file: string): Promise<SaraData | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as SaraData
  } catch {
    return null
  }
}

/** Resolves once two reads in a row, half a second apart, find the same data. */
async function settled(request: APIRequestContext): Promise<void> {
  let last = ''
  await expect
    .poll(
      async () => {
        const now = JSON.stringify(await readSaraData(request))
        const same = now === last
        last = now
        return same
      },
      { message: 'sara’s data kept changing', timeout: 15_000, intervals: [500] },
    )
    .toBe(true)
}

async function guardSara(
  { browser, playwright }: { browser: Browser; playwright: PlaywrightWorkerArgs['playwright'] },
  provide: (guard: SaraGuard) => Promise<void>,
  info: TestInfo,
): Promise<void> {
  const request = await playwright.request.newContext({
    baseURL: info.project.use.baseURL,
    storageState: await saraSession(browser, info.project),
  })
  const file = snapshotFile(info)
  try {
    const left = await readSnapshot(file)
    if (left) {
      await restoreSara(request, left)
      await rm(file)
    }
    await removeMarkers(request)
    const before = await readSaraData(request)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, JSON.stringify(before))
    await provide({ request, before })
    await settled(request)
    await restoreSara(request, before)
    await rm(file)
  } finally {
    await request.dispose()
  }
}

/** Its own time: a restore after a test that timed out still gets a minute. */
const GUARD = [guardSara, { timeout: 60_000 }] as const

/** `test` (a guest's page) with `sara`, the guard. */
export const guardedTest = base.extend<{ sara: SaraGuard }>({ sara: [...GUARD] })

/** `signedInTest` (sara's page) with `sara`, the guard. */
export const signedInGuardedTest = signedInTest.extend<{ sara: SaraGuard }>({ sara: [...GUARD] })
