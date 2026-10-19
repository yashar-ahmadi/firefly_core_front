// A guard's second read of an account's orders awaiting payment, after the test (support/
// kamran-guard.ts; ruling P4-R4): every one of them that was not there before the test is the
// test's, and is cancelled. When that read fails, that sweep cannot run, and an order the test
// placed but never handed over could stay awaiting payment unseen: the guard says so, naming
// the account and nothing of the failure (its message could carry an order's code or link).
// The orders the test handed over are cancelled either way. Pure.

/** The codes `read` gives; none when it fails, said with a warning naming `who`. */
export async function readForSweep(read: () => Promise<string[]>, who: string): Promise<string[]> {
  try {
    return await read()
  } catch {
    console.warn(
      `[${who} guard] the orders of ${who} awaiting payment could not be read again after the ` +
        'test: the sweep of orders the test did not hand over was skipped. Check that account ' +
        'for an order left awaiting payment and cancel it.',
    )
    return []
  }
}
