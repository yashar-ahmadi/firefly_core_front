import { describe, expect, it, vi } from 'vitest'
import { PROBE_PATH, probeBackend, probeVerdict } from '../../e2e/support/throttle-probe'

// The e2e global setup's probe (tests/e2e/global-setup.ts): a used-up anonymous budget stops
// the run with one clear message; anything else lets it go on.

const API = 'http://localhost:8000'

function answering(status: number, headers: Record<string, string> = {}) {
  return vi.fn<typeof fetch>(async () => new Response('{}', { status, headers }))
}

describe('probeBackend', () => {
  it('asks one cheap anonymous read with the API key', async () => {
    const fetchImpl = answering(200)
    expect(await probeBackend(`${API}/`, 'key', fetchImpl)).toEqual({ kind: 'ok' })
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe(`${API}${PROBE_PATH}`)
    expect(new Headers(init?.headers).get('X-API-Key')).toBe('key')
  })

  it('reads a 429 with its Retry-After', async () => {
    expect(await probeBackend(API, 'k', answering(429, { 'retry-after': '124' }))).toEqual({
      kind: 'throttled',
      retryAfter: 124,
    })
    expect(await probeBackend(API, 'k', answering(429))).toEqual({
      kind: 'throttled',
      retryAfter: null,
    })
  })

  it('reports a backend that cannot be reached', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new TypeError('fetch failed')
    })
    expect(await probeBackend(API, 'k', fetchImpl)).toEqual({
      kind: 'unreachable',
      reason: 'fetch failed',
    })
  })
})

describe('probeVerdict', () => {
  it('stops the run on a 429 only, saying why and what to do', () => {
    const message = probeVerdict({ kind: 'throttled', retryAfter: 124 }, API)
    expect(message).toContain('429')
    expect(message).toContain('THROTTLE_ANON')
    expect(message).toContain('about 3 min (Retry-After: 124 s)')
    expect(probeVerdict({ kind: 'ok' }, API)).toBeNull()
    expect(probeVerdict({ kind: 'unreachable', reason: 'x' }, API)).toBeNull()
  })
})
