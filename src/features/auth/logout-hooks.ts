// Steps that must run before a logout, while the session still exists: web push (Plan 3 Task 9)
// registers one that unregisters this browser's device (`DELETE devices/unregister/` needs the
// bearer). `useLogout` runs them all, then logs out whatever they did: a step that fails or
// hangs is logged and given up on, never in the way. No React, no API: safe in any bundle.

export interface LogoutStepContext {
  /** Every device is being logged out (`logout-all/` unregisters every push device itself). */
  all: boolean
}

export type LogoutStep = (context: LogoutStepContext) => void | Promise<void>

/** How long a step may take before the logout goes on without it. */
export const LOGOUT_STEP_TIMEOUT_MS = 3_000

const steps = new Set<LogoutStep>()

/** Runs `step` before every logout from now on. Returns the function that unregisters it. */
export function onBeforeLogout(step: LogoutStep): () => void {
  steps.add(step)
  return () => {
    steps.delete(step)
  }
}

async function runStep(step: LogoutStep, context: LogoutStepContext): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timed out')), LOGOUT_STEP_TIMEOUT_MS)
  })
  try {
    await Promise.race([Promise.resolve().then(() => step(context)), timeout])
  } catch (error) {
    console.warn('[logout] a step before logging out failed:', error)
  } finally {
    clearTimeout(timer)
  }
}

/** Runs every registered step at once; resolves when each has finished, failed or timed out. */
export async function runBeforeLogout(context: LogoutStepContext): Promise<void> {
  await Promise.all([...steps].map((step) => runStep(step, context)))
}
