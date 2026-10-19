// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/sw.js/route'
import { buildServiceWorker } from '@/features/pwa/sw-source'

// `/sw.js` as browsers fetch it: JavaScript, allowed the whole site as its scope, and never kept
// without asking (a new deploy's worker is picked up on the next navigation). Offline caching
// follows FEATURE_PWA, read when the worker is asked for (runtime config, R5); its caches are
// named after the running build.

const mocks = vi.hoisted(() => ({ pwa: true }))

vi.mock('server-only', () => ({}))
vi.mock('@/config/store-config', () => ({
  getStoreConfig: () => ({ features: { pwa: mocks.pwa } }),
}))
vi.mock('@/features/pwa/build-version', () => ({ buildVersion: () => 'build-42' }))

const OPTIONS = { inboxPath: '/account/notifications/', icon: '/favicon.ico', version: 'build-42' }

beforeEach(() => {
  mocks.pwa = true
})

describe('/sw.js', () => {
  it('serves the worker with the headers a service worker needs', async () => {
    const res = GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/javascript; charset=utf-8')
    expect(res.headers.get('service-worker-allowed')).toBe('/')
    expect(res.headers.get('cache-control')).toBe('no-cache')
    expect(await res.text()).toBe(buildServiceWorker({ ...OPTIONS, offline: true }))
  })

  it('FEATURE_PWA off: the push-only worker (web push registers it on opt-in)', async () => {
    mocks.pwa = false
    const source = await GET().text()
    expect(source).toBe(buildServiceWorker({ ...OPTIONS, offline: false }))
    expect(source).not.toContain("addEventListener('fetch'")
    expect(source).toContain("addEventListener('push'")
  })
})
