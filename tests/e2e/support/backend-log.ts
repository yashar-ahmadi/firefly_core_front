// What a spec that proves a count from the dev backend's log (FIREFLY_BACKEND_LOG, by default
// /tmp/backend.log: `BACKEND_LOG` in cart-write.ts) does when that file is missing: it skips on a
// developer's machine, and fails loudly when the run must prove it, i.e. with `CI` set or
// `E2E_REQUIRE_BACKEND_LOG=1` (Plan 5 Task 8, carried from Task 7's review). Pure, so the unit
// tests check the flags (tests/unit/e2e-support/backend-log.test.ts).

type Env = Record<string, string | undefined>

/** A flag that is set: anything but absent, empty, `0`, `false` or `no`. */
const isOn = (value: string | undefined) =>
  value !== undefined && !/^(?:0|false|no)?$/i.test(value.trim())

/** Whether this run must read the backend's log: `CI` or `E2E_REQUIRE_BACKEND_LOG` is on. */
export function backendLogRequired(env: Env): boolean {
  return isOn(env.E2E_REQUIRE_BACKEND_LOG) || isOn(env.CI)
}

/** `read` the log; `skip` the proof (no log, nothing requires it); `fail` (required, missing). */
export function backendLogMode({
  exists,
  env,
}: {
  exists: boolean
  env: Env
}): 'read' | 'skip' | 'fail' {
  if (exists) return 'read'
  return backendLogRequired(env) ? 'fail' : 'skip'
}
