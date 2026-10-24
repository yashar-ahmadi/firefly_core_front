import { readText, writeText } from '@/lib/store/json-storage'

// A page that mounts saying «no session» while the session flag cookie says there is one: never
// the server's render (it renders for the cookie it was sent), but a page the service worker kept,
// the home page's anonymous copy, served to a slow navigation after 4 s or offline
// (src/features/pwa/sw-offline-fetch.ts). `SessionSwitchSweep` sets it right when it mounts
// (`SessionSweepAction` with `heal`): the tab takes the session and asks the server once. When
// the server cannot be asked (offline), Next's router loads the address again, into the same copy:
// so once per login a minute in a tab, and never without storage to remember it by.

const HEALED = 'ff-session-heal'
export const HEAL_AGAIN_MS = 60_000

/** Whether this tab may set its session right for `marker` now; remembers that it does. */
export function mayHeal(marker: string, now = Date.now()): boolean {
  const [last, at] = (readText('session', HEALED) ?? '').split(' ')
  if (last === marker && Math.abs(now - Number(at)) < HEAL_AGAIN_MS) return false
  return writeText('session', HEALED, `${marker} ${now}`)
}
