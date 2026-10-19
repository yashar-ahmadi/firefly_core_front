import { OFFLINE_FALLBACK_HTML } from './offline-text'
import {
  OFFLINE_COPY,
  OFFLINE_COPY_HEADER,
  OFFLINE_PAGES,
  OFFLINE_PATH,
  SW_NEVER_CACHED,
} from './offline-rules'
import { PURGE_PAGES_MESSAGE } from './purge-offline-pages'
import { fetchSection } from './sw-offline-fetch'

// Offline caching in `/sw.js` (Plan 5 Task 6; sections of sw-source.ts, plain browser JavaScript):
//
// - install keeps the offline page and the home page, each as the anonymous copy the server
//   allows (asked for without cookies, `x-ff-offline: snapshot`: src/lib/edge/offline-copy.ts),
//   and the app's files their HTML names; it never fails (web push needs the worker);
// - `/_next/static/*` cache first (immutable); the shop's images stale while revalidate, at most
//   200; a navigation network first: the visitor's own page is shown and never kept. Only the
//   pages in OFFLINE_PAGES have a copy, served after 4 s or when the network fails; any other
//   navigation that fails gets the offline page;
// - SW_NEVER_CACHED, a non-GET, `Authorization`, another origin, a response that is not a plain
//   200 of type basic/cors, or one with `no-store`/`private`: never kept, never served from a
//   cache;
// - caches are named after the build; activate deletes every other `ff-` cache and turns on
//   navigation preload where the browser has it (a navigation then uses the preloaded response);
//   the logout's message forgets every page and picture kept (the pages kept again as the
//   anonymous copies).

/** The worker's caches for `version` (the build id). */
export function offlineCacheNames(version: string) {
  return {
    static: `ff-${version}-static`,
    images: `ff-${version}-images`,
    pages: `ff-${version}-pages`,
  }
}

/** What may not be kept: `no-store` or `private` in Cache-Control. */
export const NOT_STORABLE = /(?:^|[,\s])(?:no-store|private)(?:$|[,\s=])/
/** The app's own files an HTML page names (attributes, the RSC payload's chunk lists, url()). */
export const APP_FILE = /\/_next\/static\/[^"'\s<>\\()]+/g

export const NAVIGATION_TIMEOUT_MS = 4_000
export const IMAGE_LIMIT = 200

const js = (value: unknown) => JSON.stringify(value)

function sharedSection(version: string): string {
  return `
const VERSION = ${js(version)}
const CACHES = ${js(offlineCacheNames(version))}
const NEVER_CACHED = ${js(SW_NEVER_CACHED)}
const OFFLINE_PAGES = ${js(OFFLINE_PAGES)}
const OFFLINE_PATH = ${js(OFFLINE_PATH)}
const COPY_HEADER = ${js(OFFLINE_COPY_HEADER)}
const COPY = ${js(OFFLINE_COPY)}
const PURGE_MESSAGE = ${js(PURGE_PAGES_MESSAGE)}
const NOT_STORABLE = new RegExp(${js(NOT_STORABLE.source)})
const APP_FILE = new RegExp(${js(APP_FILE.source)}, 'g')
const STATIC_PREFIX = '/_next/static/'
const IMAGE_PREFIXES = ['/_next/image', '/media/', '/static/']
const NAVIGATION_TIMEOUT_MS = ${NAVIGATION_TIMEOUT_MS}
const IMAGE_LIMIT = ${IMAGE_LIMIT}
const INSTALL_LIMIT_MS = 10000
const COPY_MAX_AGE_MS = 600000
const KEPT_AT_HEADER = 'x-ff-kept-at'
const APP_FILE_LIMIT = 150

const neverCached = (path) =>
  NEVER_CACHED.some((rule) =>
    rule.endsWith('/') ? path === rule.slice(0, -1) || path.startsWith(rule) : path === rule,
  )

function storable(response) {
  if (!response || response.status !== 200) return false
  if (response.type !== 'basic' && response.type !== 'cors') return false
  return !NOT_STORABLE.test((response.headers.get('cache-control') || '').toLowerCase())
}

const quietly = (promise) => promise.catch(() => undefined)

function withLimit(promise, ms) {
  let timer
  const limit = new Promise((resolve) => {
    timer = setTimeout(resolve, ms)
  })
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer))
}`
}

/** Keeping and reading the pages kept for offline use. */
function pagesSection(): string {
  return `
async function anonymousCopy(path) {
  const response = await fetch(
    new Request(new URL(path, self.location.origin).href, {
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'manual',
      headers: { [COPY_HEADER]: COPY },
    }),
  )
  const html = (response.headers.get('content-type') || '').startsWith('text/html')
  return storable(response) && html && response.headers.get(COPY_HEADER) === COPY ? response : null
}

async function keepAppFiles(html) {
  const cache = await caches.open(CACHES.static)
  const paths = Array.from(new Set(html.match(APP_FILE) || [])).slice(0, APP_FILE_LIMIT)
  await Promise.all(
    paths.map(async (path) => {
      if (await cache.match(path)) return
      const response = await quietly(fetch(path))
      if (storable(response)) await quietly(cache.put(path, response))
    }),
  )
}

// Each copy is stamped with the worker's own time when kept: its age is measured on one clock,
// never from the server's Date against the device's.
async function keepPage(path) {
  const response = await quietly(anonymousCopy(path))
  if (!response) return
  const body = await response.blob()
  const headers = new Headers(response.headers)
  headers.set(KEPT_AT_HEADER, String(Date.now()))
  const copy = new Response(body, { status: response.status, statusText: response.statusText, headers })
  const cache = await caches.open(CACHES.pages)
  await cache.put(path, copy)
  await keepAppFiles(await body.text())
}

async function keepPages() {
  for (const path of OFFLINE_PAGES) await quietly(keepPage(path))
}

// By path, whatever the copy varies on (the consent's \`Vary: X-FF-Offline\`, Next's router
// headers): one copy per path, and the copy is served to the visitor's own navigation.
const keptPage = async (path) =>
  (await caches.open(CACHES.pages)).match(path, { ignoreVary: true })

const refreshing = new Map()

function refreshPage(path) {
  if (!refreshing.has(path)) {
    const run = (async () => {
      const kept = await keptPage(path)
      const age = kept ? Date.now() - Number(kept.headers.get(KEPT_AT_HEADER)) : Infinity
      // No stamp (an earlier worker's copy) or a clock set back since: kept again.
      if (!(age >= 0 && age < COPY_MAX_AGE_MS)) await keepPage(path)
    })()
    refreshing.set(path, quietly(run).finally(() => refreshing.delete(path)))
  }
  return refreshing.get(path)
}

const OFFLINE_FALLBACK = ${js(OFFLINE_FALLBACK_HTML)}

async function offlinePage() {
  const kept = await quietly(keptPage(OFFLINE_PATH))
  return (
    kept ||
    new Response(OFFLINE_FALLBACK, {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  )
}`
}

/** Install, activate and the logout's purge. */
function lifecycleSection(): string {
  return `
self.addEventListener('install', (event) => {
  event.waitUntil(withLimit(keepPages(), INSTALL_LIMIT_MS))
})

// Navigation preload, where the browser has it: a navigation's request leaves while the worker
// starts, and the fetch handler takes its response (sw-offline-fetch.ts).
const enableNavigationPreload = () =>
  self.registration.navigationPreload
    ? quietly(self.registration.navigationPreload.enable())
    : Promise.resolve()

self.addEventListener('activate', (event) => {
  const current = Object.values(CACHES)
  event.waitUntil(
    Promise.all([
      enableNavigationPreload(),
      caches.keys().then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith('ff-') && !current.includes(name))
            .map((name) => caches.delete(name)),
        ),
      ),
    ]),
  )
})

// The logout's purge: the pages and the pictures (the avatar comes through /_next/image) go;
// the anonymous copies are kept again. The app's own files hold nothing of the visitor's.
self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== PURGE_MESSAGE) return
  event.waitUntil(
    Promise.all([caches.delete(CACHES.images), caches.delete(CACHES.pages)]).then(keepPages),
  )
})`
}

/** Offline caching, for `version` (the build id). */
export function offlineSections(version: string): string[] {
  return [
    `// Offline caching (FEATURE_PWA): src/features/pwa/sw-offline.ts.`,
    sharedSection(version),
    pagesSection(),
    lifecycleSection(),
    fetchSection(),
  ]
}

/** Offline caching off: the caches an earlier worker kept go when this one takes over. */
export function cleanupSection(): string {
  return `
// Offline caching is off (FEATURE_PWA): the caches an earlier worker kept go.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name.startsWith('ff-')).map((name) => caches.delete(name))),
      ),
  )
})`
}
