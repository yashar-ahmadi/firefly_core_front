import { describe, expect, it } from 'vitest'
import { backendLogMode, backendLogRequired } from '../../e2e/support/backend-log'

// The specs that prove a count from the dev backend's log (tests/e2e/seo-urls.spec.ts: the
// tracking cache key, the negative cache, one search/ per results page) skip without the log on a
// developer's machine, but must fail loudly where the run is meant to prove them (Task 7 review).

describe('backendLogRequired', () => {
  it.each([
    [{}, false],
    [{ CI: '' }, false],
    [{ CI: '0' }, false],
    [{ CI: 'false' }, false],
    [{ CI: '1' }, true],
    [{ CI: 'true' }, true],
    [{ E2E_REQUIRE_BACKEND_LOG: '1' }, true],
    [{ E2E_REQUIRE_BACKEND_LOG: 'true' }, true],
    [{ E2E_REQUIRE_BACKEND_LOG: '0' }, false],
    [{ E2E_REQUIRE_BACKEND_LOG: ' ' }, false],
  ])('%o → %s', (env, required) => {
    expect(backendLogRequired(env)).toBe(required)
  })
})

describe('backendLogMode', () => {
  it('reads the log when it is there, flag or not', () => {
    expect(backendLogMode({ exists: true, env: {} })).toBe('read')
    expect(backendLogMode({ exists: true, env: { CI: '1' } })).toBe('read')
  })

  it('skips without the log on a developer’s machine', () => {
    expect(backendLogMode({ exists: false, env: {} })).toBe('skip')
  })

  it('fails without the log when a run must prove it', () => {
    expect(backendLogMode({ exists: false, env: { CI: 'true' } })).toBe('fail')
    expect(backendLogMode({ exists: false, env: { E2E_REQUIRE_BACKEND_LOG: '1' } })).toBe('fail')
  })
})
