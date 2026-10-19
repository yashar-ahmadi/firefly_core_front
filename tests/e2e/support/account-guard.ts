import { expect, type APIRequestContext, type TestInfo } from '@playwright/test'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  readAccountData,
  removeCheckoutMarkers,
  restoreAccountData,
  type AccountData,
} from './account-data'

// A demo account's cart and address book kept safe around a write journey (Plan 4; ruling P4-R4:
// k.yazdi's and shirin's, never sara's), for a guard fixture to run around the test: what an
// earlier run left is put back first (a snapshot on disk, deleted only once a restore is verified;
// marker addresses), the data is read and written to that snapshot before the test, and after
// it, however it ended, the data is waited on until it stops moving (a write the page still had
// on its way), restored exactly and checked. `request` carries the account's session and is
// still open when the fixture tears down.

export interface AccountName {
  /** Said in a failure («k.yazdi», «shirin»). */
  who: string
  /** The snapshot file's name (`<name>-<project>.json` under tests/e2e/.state/). */
  file: string
}

/** Outside the output folder (emptied at every run's start): it must outlive a crashed run. */
function snapshotFile(info: TestInfo, name: string): string {
  return path.join(info.project.testDir, '.state', `${name}-${info.project.name}.json`)
}

async function restoreLeftover(request: APIRequestContext, file: string, who: string) {
  let left: AccountData
  try {
    left = JSON.parse(await readFile(file, 'utf8')) as AccountData
  } catch {
    return
  }
  try {
    await restoreAccountData(request, left, who)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(
      `An earlier run left a snapshot of ${who}'s cart and address book that cannot be put ` +
        `back: ${file}\nCheck them through the BFF, then delete that file and run again.\n${reason}`,
      { cause: error },
    )
  }
  await rm(file)
}

/** Resolves once two reads in a row, half a second apart, find the same data. */
async function settled(request: APIRequestContext, who: string): Promise<void> {
  let last = ''
  await expect
    .poll(
      async () => {
        const now = JSON.stringify(await readAccountData(request))
        const same = now === last
        last = now
        return same
      },
      { message: `${who}’s data kept changing`, timeout: 15_000, intervals: [500] },
    )
    .toBe(true)
}

/** `during(before)` between the snapshot and the verified restore (see the module's comment). */
export async function withAccountData(
  request: APIRequestContext,
  info: TestInfo,
  { who, file: name }: AccountName,
  during: (before: AccountData) => Promise<void>,
): Promise<void> {
  const file = snapshotFile(info, name)
  await restoreLeftover(request, file, who)
  await removeCheckoutMarkers(request)
  const before = await readAccountData(request)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(before))
  await during(before)
  try {
    await settled(request, who)
  } finally {
    // Whatever the wait came to, the data goes back (a failed wait is still reported); the
    // snapshot goes once the restore is verified.
    await restoreAccountData(request, before, who)
    await rm(file)
  }
}
