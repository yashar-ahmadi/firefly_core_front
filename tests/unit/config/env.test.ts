import { describe, expect, it, vi } from 'vitest'
import { parseServerEnv } from '@/config/env-schema'

const base = {
  FIREFLY_API_URL: 'https://api.shop.ir/',
  SITE_URL: 'https://shop.ir/',
  FIREFLY_API_KEY: 'k',
}

function errorOf(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    return (error as Error).message
  }
  throw new Error('expected the call to throw')
}

describe('parseServerEnv', () => {
  it('applies defaults and strips trailing slashes', () => {
    const env = parseServerEnv(base)
    expect(env.FIREFLY_API_URL).toBe('https://api.shop.ir')
    expect(env.SITE_URL).toBe('https://shop.ir')
    expect(env.FIREFLY_API_KEY).toBe('k')
    expect(env.STORE_PRESET).toBe('default')
    expect(env.THEME_FONT).toBe('vazirmatn')
    expect(env.THEME_PRIMARY).toBeUndefined()
    expect(env.THEME_ACCENT).toBeUndefined()
    expect(env.THEME_RADIUS).toBeUndefined()
    expect(env.FEATURE_COMPARE).toBe(true)
    expect(env.FEATURE_QUICK_VIEW).toBe(true)
    expect(env.FEATURE_RECENTLY_VIEWED).toBe(true)
    expect(env.FEATURE_PWA).toBe(true)
    expect(env.CLIENT_IP_HEADER).toBe('x-real-ip')
    expect(env.FIREBASE).toBeUndefined()
  })

  it('strips several trailing slashes but keeps a path prefix', () => {
    const env = parseServerEnv({ ...base, FIREFLY_API_URL: 'https://shop.ir/backend///' })
    expect(env.FIREFLY_API_URL).toBe('https://shop.ir/backend')
  })

  it('rejects an invalid hex colour and names the variable', () => {
    expect(errorOf(() => parseServerEnv({ ...base, THEME_PRIMARY: 'blue' }))).toContain(
      'THEME_PRIMARY',
    )
    expect(() => parseServerEnv({ ...base, THEME_ACCENT: '#12345' })).toThrow(/THEME_ACCENT/)
    expect(() => parseServerEnv({ ...base, THEME_ACCENT: '#12345g' })).toThrow(/THEME_ACCENT/)
  })

  it('accepts six-digit hex colours in either case', () => {
    const env = parseServerEnv({ ...base, THEME_PRIMARY: '#abcdef', THEME_ACCENT: '#ABCDEF' })
    expect(env.THEME_PRIMARY).toBe('#abcdef')
    expect(env.THEME_ACCENT).toBe('#ABCDEF')
  })

  it('requires FIREFLY_API_KEY only when NODE_ENV is production', () => {
    const { FIREFLY_API_KEY: _omit, ...withoutKey } = base
    void _omit
    expect(() => parseServerEnv({ ...withoutKey, NODE_ENV: 'production' })).toThrow(
      /FIREFLY_API_KEY/,
    )
    expect(() =>
      parseServerEnv({ ...withoutKey, NODE_ENV: 'production', FIREFLY_API_KEY: '' }),
    ).toThrow(/FIREFLY_API_KEY/)
    expect(parseServerEnv({ ...withoutKey, NODE_ENV: 'development' }).FIREFLY_API_KEY).toBe('')
    expect(parseServerEnv(withoutKey).FIREFLY_API_KEY).toBe('')
  })

  it('defaults the URLs for local development only', () => {
    const dev = parseServerEnv({})
    expect(dev.FIREFLY_API_URL).toBe('http://localhost:8000')
    expect(dev.SITE_URL).toBe('http://localhost:3000')
    expect(parseServerEnv({ NODE_ENV: 'test' }).SITE_URL).toBe('http://localhost:3000')
    const message = errorOf(() => parseServerEnv({ NODE_ENV: 'production' }))
    expect(message).toContain('FIREFLY_API_URL')
    expect(message).toContain('SITE_URL')
  })

  it('lists every invalid variable in one error', () => {
    const message = errorOf(() =>
      parseServerEnv({
        NODE_ENV: 'production',
        FIREFLY_API_URL: 'ftp://api.shop.ir',
        SITE_URL: 'not a url',
        STORE_PRESET: 'jewelry',
        THEME_RADIUS: 'huge',
        THEME_FONT: 'comic',
        FEATURE_PWA: 'maybe',
      }),
    )
    for (const name of [
      'FIREFLY_API_URL',
      'FIREFLY_API_KEY',
      'SITE_URL',
      'STORE_PRESET',
      'THEME_RADIUS',
      'THEME_FONT',
      'FEATURE_PWA',
    ]) {
      expect(message).toContain(name)
    }
  })

  it.each([
    'https://api.shop.ir/?x=1',
    'https://api.shop.ir/backend?x',
    'https://api.shop.ir/#top',
    'https://api.shop.ir?',
    'https://api.shop.ir/#',
  ])('refuses a FIREFLY_API_URL with a query or a fragment: %s', (value) => {
    const message = errorOf(() => parseServerEnv({ ...base, FIREFLY_API_URL: value }))
    expect(message).toContain(
      'FIREFLY_API_URL: must be the bare API origin, without a query (?) or fragment (#)',
    )
  })

  it('parses booleans from true, false, 1 and 0', () => {
    expect(parseServerEnv({ ...base, FEATURE_COMPARE: 'false' }).FEATURE_COMPARE).toBe(false)
    expect(parseServerEnv({ ...base, FEATURE_COMPARE: '0' }).FEATURE_COMPARE).toBe(false)
    expect(parseServerEnv({ ...base, FEATURE_QUICK_VIEW: 'true' }).FEATURE_QUICK_VIEW).toBe(true)
    expect(parseServerEnv({ ...base, FEATURE_PWA: '1' }).FEATURE_PWA).toBe(true)
    expect(() => parseServerEnv({ ...base, FEATURE_COMPARE: 'maybe' })).toThrow(/FEATURE_COMPARE/)
  })

  it('treats empty and blank values as unset', () => {
    const env = parseServerEnv({
      ...base,
      THEME_PRIMARY: '',
      THEME_RADIUS: '  ',
      STORE_PRESET: '',
      FEATURE_COMPARE: '',
      NESHAN_MAP_KEY: '',
    })
    expect(env.THEME_PRIMARY).toBeUndefined()
    expect(env.THEME_RADIUS).toBeUndefined()
    expect(env.STORE_PRESET).toBe('default')
    expect(env.FEATURE_COMPARE).toBe(true)
    expect(env.NESHAN_MAP_KEY).toBeUndefined()
  })

  it('drops one pair of surrounding quotes', () => {
    const env = parseServerEnv({ ...base, THEME_PRIMARY: '"#4F46E5"', NESHAN_MAP_KEY: "'web.abc'" })
    expect(env.THEME_PRIMARY).toBe('#4F46E5')
    expect(env.NESHAN_MAP_KEY).toBe('web.abc')
  })

  it('reads the optional Neshan keys', () => {
    const env = parseServerEnv({
      ...base,
      NESHAN_MAP_KEY: 'web.abc',
      NESHAN_SERVICE_KEY: 'service.xyz',
    })
    expect(env.NESHAN_MAP_KEY).toBe('web.abc')
    expect(env.NESHAN_SERVICE_KEY).toBe('service.xyz')
  })

  it('builds the Firebase config only when all five variables are set', () => {
    const firebase = {
      FIREBASE_API_KEY: 'api',
      FIREBASE_PROJECT_ID: 'project',
      FIREBASE_MESSAGING_SENDER_ID: 'sender',
      FIREBASE_APP_ID: 'app',
      FIREBASE_VAPID_KEY: 'vapid',
    }
    expect(parseServerEnv({ ...base, ...firebase }).FIREBASE).toEqual({
      apiKey: 'api',
      projectId: 'project',
      messagingSenderId: 'sender',
      appId: 'app',
      vapidKey: 'vapid',
    })
    const { FIREBASE_VAPID_KEY: _omit, ...partial } = firebase
    void _omit
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(parseServerEnv({ ...base, ...partial }).FIREBASE).toBeUndefined()
      // Part of the set is a mistake, not a choice: said once, by name, never the values.
      expect(warn).toHaveBeenCalledExactlyOnceWith(
        '[env] Web push is off: FIREBASE_* is incomplete (missing FIREBASE_VAPID_KEY).',
      )
      warn.mockClear()
      parseServerEnv({ ...base, ...firebase })
      parseServerEnv(base)
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('normalises CLIENT_IP_HEADER to a lower-case header name or none', () => {
    expect(parseServerEnv({ ...base, CLIENT_IP_HEADER: 'CF-Connecting-IP' }).CLIENT_IP_HEADER).toBe(
      'cf-connecting-ip',
    )
    expect(parseServerEnv({ ...base, CLIENT_IP_HEADER: 'none' }).CLIENT_IP_HEADER).toBe('none')
    expect(() => parseServerEnv({ ...base, CLIENT_IP_HEADER: 'x real ip' })).toThrow(
      /CLIENT_IP_HEADER/,
    )
  })

  it('rejects an unknown STORE_PRESET', () => {
    expect(() => parseServerEnv({ ...base, STORE_PRESET: 'jewelry' })).toThrow(/STORE_PRESET/)
  })
})
