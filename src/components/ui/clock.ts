// A shared one-second clock for countdowns: one interval for every subscriber on the page.
// The snapshot is `null` until something subscribes (always on the server), so a server render
// and the first client render agree and the real time appears only after mount.

type Listener = () => void

const TICK_MS = 1000
const listeners = new Set<Listener>()
let now = 0
let timer: ReturnType<typeof setInterval> | undefined

export function subscribeClock(listener: Listener): () => void {
  listeners.add(listener)
  if (timer === undefined) {
    now = Date.now()
    timer = setInterval(() => {
      now = Date.now()
      for (const notify of listeners) notify()
    }, TICK_MS)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer !== undefined) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

/** The time of the last tick, or `null` while the clock is not running. */
export function clockNow(): number | null {
  return timer === undefined ? null : now
}
