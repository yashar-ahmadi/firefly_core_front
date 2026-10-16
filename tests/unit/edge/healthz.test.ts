// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

// The liveness probe must answer on its own: no API, no settings, no environment.

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('/healthz', () => {
  it('answers 200 "ok" as uncached plain text without calling the API', async () => {
    // A production environment with nothing configured would make getServerEnv() throw.
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('FIREFLY_API_URL', '')
    vi.stubEnv('FIREFLY_API_KEY', '')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const route = await import('@/app/healthz/route')
    const res = await route.GET()
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(route.dynamic).toBe('force-dynamic')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
