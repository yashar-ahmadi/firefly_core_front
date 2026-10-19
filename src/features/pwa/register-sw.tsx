import { MAY_OFFER_EVENT, MAY_OFFER_FLAG } from './install-flag'
import {
  DISMISSED_KEY,
  INSTALLABLE_EVENT,
  NO_PROMPT_PATH,
  OFFER_KEPT,
  PHONE_QUERY,
  SESSION_KEY,
  STANDALONE_QUERY,
  VISITS_BEFORE_PROMPT,
  VISITS_KEY,
} from './install-state'

// The service worker's registration (Plan 5 Task 6): `/sw.js` for the whole site, the same
// registration web push makes on opt-in (src/features/push/push-flow.ts). A few lines of inline
// script the root layout writes into the page instead of a client component: no chunk to
// download on any route, and nothing at all with FEATURE_PWA off or outside a production build
// (a development server never gets a worker that caches). For the install prompt it also counts
// the visits (one per tab session), decides whether this device may be offered the install (a
// phone, from the second visit, never dismissed, never the installed app, not landing on the
// visitor's own pages: a flag and its event, which the shop layout's gate reads, so only such a
// device downloads the prompt), and keeps the browser's install offer, which can come before any
// of the app's code runs (install-state.ts).

const js = (value: string) => JSON.stringify(value)

/** Plain browser JavaScript, run as the page is parsed; the work waits for `load` and idle. */
export const REGISTER_SCRIPT = `(function () {
  var w = window
  w.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault()
    w[${js(OFFER_KEPT)}] = event
    w.dispatchEvent(new Event(${js(INSTALLABLE_EVENT)}))
  })
  try {
    var visits = parseInt(localStorage.getItem(${js(VISITS_KEY)}), 10) || 0
    if (!sessionStorage.getItem(${js(SESSION_KEY)})) {
      sessionStorage.setItem(${js(SESSION_KEY)}, '1')
      localStorage.setItem(${js(VISITS_KEY)}, String(++visits))
    }
    if (
      visits >= ${VISITS_BEFORE_PROMPT} &&
      localStorage.getItem(${js(DISMISSED_KEY)}) === null &&
      matchMedia(${js(PHONE_QUERY)}).matches &&
      !matchMedia(${js(STANDALONE_QUERY)}).matches &&
      navigator.standalone !== true &&
      !new RegExp(${js(NO_PROMPT_PATH.source)}).test(location.pathname)
    ) {
      w[${js(MAY_OFFER_FLAG)}] = true
      w.dispatchEvent(new Event(${js(MAY_OFFER_EVENT)}))
    }
  } catch (error) {}
  if (!('serviceWorker' in navigator)) return
  var register = function () {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () {})
  }
  var idle = function () {
    (w.requestIdleCallback || function (callback) { setTimeout(callback, 1) })(register)
  }
  if (document.readyState === 'complete') idle()
  else w.addEventListener('load', idle, { once: true })
})()`

/** The registration script, in production builds with FEATURE_PWA on; else nothing. */
export function RegisterServiceWorker({ enabled }: { enabled: boolean }) {
  if (!enabled || process.env.NODE_ENV !== 'production') return null
  return <script id="ff-sw-register" dangerouslySetInnerHTML={{ __html: REGISTER_SCRIPT }} />
}
