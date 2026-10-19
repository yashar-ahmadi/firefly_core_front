import 'server-only'
import { ApiError } from '@/lib/api/errors'
import { apiFetch } from '@/lib/api/server'
import type { BlogOff } from '@/lib/edge/blog-gate'

/**
 * Whether the blog is switched off, for the proxy: a blog page then answers 503 (src/proxy.ts),
 * since a page cannot set its own status in Next 16 (only 404, and 401/403 behind a flag).
 *
 * `GET global/feature-status/blog/` is kept in memory per server process for a minute (as long as
 * the shell's feature map is cached), served stale while one refresh runs, and awaited only by
 * the first request. A failed read says nothing about the switch: what was known stays (on, at
 * first; the API refuses the blog's endpoints itself and the page then shows the switch) and the
 * read is tried again after 15 s.
 *
 * A blog page whose read the API refused with `503 feature_disabled` calls `noteBlogOff`: off at
 * once, so the next request answers 503 without waiting for the minute. A read that was already
 * on its way then answers older news: whatever it brings (or fails with) is ignored, and the
 * note's minute stands (`generation`). The state lives on `globalThis`: the proxy and the pages
 * are separate bundles of one server process.
 */

const TTL_MS = 60_000
const RETRY_MS = 15_000
const TIMEOUT_MS = 1_500

interface SwitchState {
  off: BlogOff | null
  /** When the switch is due for a (re)read: a minute after a success, 15 s after a failure. */
  nextLoadAt: number
  /** Whether a read has finished (or a page has said): only the very first one is awaited. */
  settled: boolean
  refreshing: Promise<void> | null
  /** Bumped by every `noteBlogOff`: a read started before it no longer counts. */
  generation: number
}

/** The process-wide state's key (also for tests, which delete it to start over). */
export const BLOG_SWITCH_STATE = Symbol.for('firefly.blog-switch')

function state(): SwitchState {
  const holder = globalThis as typeof globalThis & { [BLOG_SWITCH_STATE]?: SwitchState }
  holder[BLOG_SWITCH_STATE] ??= {
    off: null,
    nextLoadAt: 0,
    settled: false,
    refreshing: null,
    generation: 0,
  }
  return holder[BLOG_SWITCH_STATE]
}

interface FeatureRow {
  is_enabled?: unknown
  disable_reason?: unknown
}

async function readSwitch(): Promise<BlogOff | null> {
  try {
    const { data } = await apiFetch<FeatureRow | null>('global/feature-status/blog', {
      timeoutMs: TIMEOUT_MS,
    })
    if (data?.is_enabled !== false) return null
    const reason = typeof data.disable_reason === 'string' ? data.disable_reason.trim() : ''
    return { reason: reason || null }
  } catch (error) {
    // A key the API does not know is a switch that does not exist: on (its own rule).
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

/**
 * One read of the switch into `current`. A page may note the switch off while it is on its way
 * (`generation` bumped): the note is newer, so the answer, or the failure's retry time, is dropped.
 */
function refresh(current: SwitchState): Promise<void> {
  const generation = current.generation
  const stillNews = () => current.generation === generation
  return readSwitch()
    .then(
      (off) => {
        if (!stillNews()) return
        current.off = off
        current.nextLoadAt = Date.now() + TTL_MS
      },
      (error: unknown) => {
        const why = error instanceof ApiError ? `${error.status} ${error.code}` : String(error)
        console.error('[blog-switch] could not read the blog switch:', why)
        if (stillNews()) current.nextLoadAt = Date.now() + RETRY_MS
      },
    )
    .finally(() => {
      current.settled = true
      current.refreshing = null
    })
}

/** The blog's switch as last read: null while it is on (or not known). Never throws. */
export async function blogSwitchOff(): Promise<BlogOff | null> {
  const current = state()
  if (Date.now() >= current.nextLoadAt) {
    current.refreshing ??= refresh(current)
    if (!current.settled) await current.refreshing
  }
  return current.off
}

/** A blog read was refused (`503 feature_disabled`): the switch is off from now on, for a minute. */
export function noteBlogOff(off: BlogOff): void {
  const current = state()
  current.off = off
  current.nextLoadAt = Date.now() + TTL_MS
  current.settled = true
  current.generation += 1
}
