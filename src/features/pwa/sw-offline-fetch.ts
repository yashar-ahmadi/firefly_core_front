import { CREDENTIAL_PREFIXES } from '@/config/credential-routes'

// The requests `/sw.js`'s offline caching answers, and how (Plan 5 Task 6; a section of
// sw-offline.ts, plain browser JavaScript run after its shared and pages sections, whose
// constants and helpers it uses): cache first for the app's files, stale while revalidate for the
// shop's images, network first for the kept pages, the network alone (then the offline page) for
// every other navigation, and nothing at all for anything never cached. A navigation's network
// answer is the browser's preloaded response when navigation preload is on.
//
// A navigation to a page never cached, or whose address holds a credential (a payment link's
// token, a payment's uuid, or a `next` leading back to one: the rule of credential-routes.ts), is
// the network's alone, and offline gets the page built into the worker, never a kept one: a kept
// page is a page of the shop's, whose scripts (the operator's analytics among them, on the home
// page) would run at that address and could read it (Plan 5 final fix wave).

/** The requests the worker answers, and how. */
export function fetchSection(): string {
  return `
const CREDENTIAL_PREFIXES = ${JSON.stringify(CREDENTIAL_PREFIXES)}

// credential-routes.ts's \`isCredentialPath\` and \`carriesCredential\`, for the worker.
function credentialPath(path) {
  const spelled = (path.endsWith('/') ? path : path + '/').toLowerCase()
  return CREDENTIAL_PREFIXES.some((prefix) => spelled.startsWith(prefix))
}

function sealed(url) {
  if (neverCached(url.pathname) || credentialPath(url.pathname)) return true
  const next = url.searchParams.get('next')
  return next !== null && next.startsWith('/') && credentialPath(next.split(/[?#]/, 1)[0])
}

async function cacheFirst(event) {
  const cache = await caches.open(CACHES.static)
  const kept = await cache.match(event.request)
  if (kept) return kept
  const response = await fetch(event.request)
  if (storable(response)) event.waitUntil(quietly(cache.put(event.request, response.clone())))
  return response
}

async function trim(cache, limit) {
  const keys = await cache.keys()
  await Promise.all(keys.slice(0, Math.max(0, keys.length - limit)).map((key) => cache.delete(key)))
}

// The page never waits for the cache: the picture goes on at once, stored and trimmed behind it.
async function staleWhileRevalidate(event) {
  const cache = await caches.open(CACHES.images)
  const kept = await cache.match(event.request)
  const fresh = fetch(event.request).then((response) => {
    if (storable(response)) {
      const copy = response.clone()
      event.waitUntil(quietly(cache.put(event.request, copy).then(() => trim(cache, IMAGE_LIMIT))))
    }
    return response
  })
  if (!kept) return fresh
  event.waitUntil(quietly(fresh))
  return kept
}

// A navigation's page: the browser's preloaded response when navigation preload is on (its
// request left while the worker was starting), else the worker's own fetch.
function navigationResponse(event) {
  return Promise.resolve(event.preloadResponse).then(
    (preloaded) => preloaded || fetch(event.request),
  )
}

async function networkOnly(event, bare) {
  try {
    return await navigationResponse(event)
  } catch (error) {
    return bare ? fallbackPage() : offlinePage()
  }
}

const TIMED_OUT = {}
const FAILED = {}

async function networkFirst(event, path) {
  const network = navigationResponse(event)
  let timer
  const late = new Promise((resolve) => {
    timer = setTimeout(resolve, NAVIGATION_TIMEOUT_MS, TIMED_OUT)
  })
  const first = await Promise.race([network, late]).catch(() => FAILED)
  clearTimeout(timer)
  if (first !== TIMED_OUT && first !== FAILED) {
    event.waitUntil(refreshPage(path))
    return first
  }
  const kept = await quietly(keptPage(path))
  if (kept) {
    quietly(network)
    return kept
  }
  if (first === FAILED) return offlinePage()
  try {
    const response = await network
    event.waitUntil(refreshPage(path))
    return response
  } catch (error) {
    return offlinePage()
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || request.headers.has('authorization')) return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  const path = url.pathname
  if (request.mode === 'navigate') {
    if (sealed(url)) event.respondWith(networkOnly(event, true))
    else if (OFFLINE_PAGES.includes(path)) event.respondWith(networkFirst(event, path))
    else event.respondWith(networkOnly(event, false))
    return
  }
  // First, whatever the path looks like: no rule below may ever reach one of these.
  if (neverCached(path)) return
  if (path.startsWith(STATIC_PREFIX)) {
    event.respondWith(cacheFirst(event))
  } else if (
    request.destination === 'image' &&
    IMAGE_PREFIXES.some((prefix) => path.startsWith(prefix))
  ) {
    event.respondWith(staleWhileRevalidate(event))
  }
})`
}
