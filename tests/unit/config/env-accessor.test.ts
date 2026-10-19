import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HOSTILE_SHELL_ENV, useHermeticEnv } from '../support/hermetic-env'

const SHELL_STORE_PRESET = process.env.STORE_PRESET
const SHELL_FIREBASE_API_KEY = process.env.FIREBASE_API_KEY

// The memoized accessor reads `process.env`; these tests give it their own environment only
// (useHermeticEnv). The shell's is made hostile first, so a test that read it would fail.

describe('getServerEnv (server accessor)', () => {
  // Registered before useHermeticEnv: its afterEach runs after the real environment is back
  // (after-hooks run in reverse order), so the stubs are undone there, not on the test's copy.
  beforeEach(() => {
    for (const [name, value] of Object.entries(HOSTILE_SHELL_ENV)) vi.stubEnv(name, value)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
    vi.doUnmock('server-only')
  })
  const setEnv = useHermeticEnv()

  async function loadAccessor() {
    vi.resetModules()
    vi.doMock('server-only', () => ({}))
    return import('@/config/env')
  }

  it('throws when called, never when the module is imported', async () => {
    setEnv({ NODE_ENV: 'production' })
    const { getServerEnv } = await loadAccessor()
    expect(() => getServerEnv()).toThrow(/FIREFLY_API_KEY/)
  })

  it('memoizes the parsed environment', async () => {
    setEnv({ FIREFLY_API_URL: 'https://api.shop.ir/', SITE_URL: 'https://shop.ir/' })
    const { getServerEnv } = await loadAccessor()
    const first = getServerEnv()
    expect(first.FIREFLY_API_URL).toBe('https://api.shop.ir')
    expect(getServerEnv()).toBe(first)
  })

  it('sees none of the shell’s variables: only the defaults and what the test set', async () => {
    expect(process.env.STORE_PRESET).toBeUndefined()
    setEnv({ FIREFLY_API_KEY: 'k' })
    const { getServerEnv } = await loadAccessor()
    const env = getServerEnv()
    expect(env).toMatchObject({
      FIREFLY_API_URL: 'http://localhost:8000',
      SITE_URL: 'http://localhost:3000',
      FIREFLY_API_KEY: 'k',
      STORE_PRESET: 'default',
      CLIENT_IP_HEADER: 'x-real-ip',
      FEATURE_PWA: true,
    })
    expect(env.THEME_PRIMARY).toBeUndefined()
    expect(env.FIREBASE).toBeUndefined()
  })
})

describe('the shell’s environment after the hermetic tests', () => {
  it('is back as it was: no stub of theirs left behind', () => {
    expect(process.env.STORE_PRESET).toBe(SHELL_STORE_PRESET)
    expect(process.env.FIREBASE_API_KEY).toBe(SHELL_FIREBASE_API_KEY)
  })
})
