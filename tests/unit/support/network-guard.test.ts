import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNetworkGuard } from './network-guard'

// The unit suite's network guard (Task 9 fix round, controller ruling): no unit test may reach a
// real server. vitest.setup.ts puts the guard in place of `fetch`; a request to an absolute
// http(s) URL that the test did not stub is refused and remembered, and the test fails after it
// even when the code under test swallowed the refusal (a loader that answers null on any error).

const real = vi.fn(async () => new Response('real'))
afterEach(() => real.mockClear())

describe('createNetworkGuard', () => {
  it('refuses an absolute http(s) URL, never calling the real fetch, and remembers it', async () => {
    const guard = createNetworkGuard(real)
    await expect(guard.fetch('http://localhost:8000/api/v1/x/')).rejects.toThrow(
      /network guard.*http:\/\/localhost:8000\/api\/v1\/x\//,
    )
    await expect(guard.fetch(new URL('https://api.example.ir/a/'))).rejects.toThrow(/network/)
    await expect(guard.fetch(new Request('https://api.example.ir/b/'))).rejects.toThrow(/network/)
    expect(real).not.toHaveBeenCalled()
    expect(guard.takeEscapes()).toEqual([
      'http://localhost:8000/api/v1/x/',
      'https://api.example.ir/a/',
      'https://api.example.ir/b/',
    ])
    expect(guard.takeEscapes()).toEqual([])
  })

  it('lets anything else through to the real fetch (a relative path, a data: URL)', async () => {
    const guard = createNetworkGuard(real)
    await guard.fetch('/api/bff/cart/')
    await guard.fetch('data:text/plain,x')
    expect(real).toHaveBeenCalledTimes(2)
    expect(guard.takeEscapes()).toEqual([])
  })

  it('a test that stubs fetch itself is not guarded (the stub replaces the guard)', async () => {
    const guard = createNetworkGuard(real)
    vi.stubGlobal('fetch', guard.fetch)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('stubbed')),
    )
    expect(await (await fetch('http://localhost:8000/api/v1/x/')).text()).toBe('stubbed')
    expect(guard.takeEscapes()).toEqual([])
    vi.unstubAllGlobals()
  })
})
