// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stubEnv } from '../bff/support'

// The health probe validates the runtime environment (a misconfigured container must not report
// healthy) but never calls the API: a backend outage must not get the storefront restarted.

type Healthz = typeof import('@/app/healthz/route')

let fetchSpy: ReturnType<typeof vi.spyOn>
let consoleError: ReturnType<typeof vi.spyOn>

async function load(): Promise<Healthz> {
  vi.resetModules()
  vi.doMock('server-only', () => ({}))
  return import('@/app/healthz/route')
}

/** A production environment with nothing configured: getServerEnv() throws. */
function stubBrokenEnv() {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('FIREFLY_API_URL', '')
  vi.stubEnv('FIREFLY_API_KEY', 'super-secret-key')
  vi.stubEnv('SITE_URL', 'not a url')
}

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch')
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.resetModules()
  vi.doUnmock('server-only')
})

describe('/healthz', () => {
  it('answers 200 "ok" as uncached plain text with a valid environment, without the API', async () => {
    stubEnv()
    vi.stubEnv('NODE_ENV', 'production')
    const route = await load()
    const res = route.GET()
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(route.dynamic).toBe('force-dynamic')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('answers 503 "unhealthy" with no detail when the environment is invalid', async () => {
    stubBrokenEnv()
    const { GET } = await load()
    const res = GET()
    expect(res.status).toBe(503)
    expect(await res.text()).toBe('unhealthy')
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('logs the invalid variables once for operators, never their values', async () => {
    stubBrokenEnv()
    const { GET } = await load()
    GET()
    GET()
    GET()
    expect(consoleError).toHaveBeenCalledTimes(1)
    const logged = consoleError.mock.calls[0]?.map(String).join(' ') ?? ''
    expect(logged).toContain('[healthz]')
    expect(logged).toContain('FIREFLY_API_URL')
    expect(logged).toContain('SITE_URL')
    expect(logged).not.toContain('super-secret-key')
    expect(logged).not.toContain('not a url')
  })
})
