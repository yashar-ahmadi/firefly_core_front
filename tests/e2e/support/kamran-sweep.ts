import { readForSweep } from './sweep-read'

// The `kamran` guard's sweep after a test (support/kamran-guard.ts; ruling P4-R4: k.yazdi, never
// sara, and no order left awaiting payment). Every order the test handed over is cancelled, and
// every order of his awaiting payment now that was not before the test: one the test placed but
// never handed over (an answer it did not read). His older orders are never touched. When the
// read before the test failed there is nothing to compare with (only the handed-over ones go);
// when the read after it fails, that part is skipped and said (support/sweep-read.ts). Pure but
// for its callbacks (unit-tested: tests/unit/e2e-support/kamran-sweep.test.ts).

export interface SweepInput {
  /** The orders the test handed over (`track`). */
  placed: readonly string[]
  /** His orders awaiting payment before the test; null when that read failed. */
  before: ReadonlySet<string> | null
  /** His orders awaiting payment now. */
  readNow: () => Promise<string[]>
  /** Cancels one; true when it is cancelled now or was already. */
  cancel: (code: string) => Promise<boolean>
}

/** Sweeps, one order at a time; returns the codes that could not be cancelled. */
export async function sweepOrders({
  placed,
  before,
  readNow,
  cancel,
}: SweepInput): Promise<string[]> {
  const now = before ? await readForSweep(readNow, 'k.yazdi') : []
  const his = new Set([...placed, ...now.filter((code) => !before?.has(code))])
  const left: string[] = []
  for (const code of his) if (!(await cancel(code))) left.push(code)
  return left
}
