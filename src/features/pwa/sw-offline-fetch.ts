// The requests `/sw.js`'s offline caching answers, and how (Plan 5 Task 6; a section of
// sw-offline.ts, plain browser JavaScript run after its shared and pages sections, whose
// constants and helpers it uses): cache first for the app's files, stale while revalidate for the
// shop's images, network first for the kept pages, the network alone (then the offline page) for
// every other navigation, and nothing at all for anything never cached.

/** The requests the worker answers, and how. */
export function fetchSection(): string {
  return `
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

async function staleWhileRevalidate(event) {
  const cache = await caches.open(CACHES.images)
  const kept = await cache.match(event.request)
  const fresh = fetch(event.request).then(async (response) => {
    if (storable(response)) {
      await cache.put(event.request, response.clone())
      await trim(cache, IMAGE_LIMIT)
    }
    return response
  })
  if (!kept) return fresh
  event.waitUntil(quietly(fresh))
  return kept
}

async function networkOnly(request) {
  try {
    return await fetch(request)
  } catch (error) {
    return offlinePage()
  }
}

const TIMED_OUT = {}
const FAILED = {}

async function networkFirst(event, path) {
  const network = fetch(event.request)
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
    const kept = !neverCached(path) && OFFLINE_PAGES.includes(path)
    event.respondWith(kept ? networkFirst(event, path) : networkOnly(request))
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
