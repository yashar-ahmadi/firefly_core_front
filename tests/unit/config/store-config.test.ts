import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseServerEnv, type ServerEnv } from '@/config/env-schema'
import { PRESET_NAMES, PRESETS, type PresetName } from '@/config/presets'
import { resolveStoreConfig, toPublicConfig } from '@/config/resolve-store-config'

const base = {
  FIREFLY_API_URL: 'https://api.shop.ir/',
  SITE_URL: 'https://shop.ir/',
  FIREFLY_API_KEY: 'k',
}

function envWith(extra: Record<string, string> = {}): ServerEnv {
  return parseServerEnv({ ...base, ...extra })
}

const firebase = {
  FIREBASE_API_KEY: 'api',
  FIREBASE_PROJECT_ID: 'project',
  FIREBASE_MESSAGING_SENDER_ID: 'sender',
  FIREBASE_APP_ID: 'app',
  FIREBASE_VAPID_KEY: 'vapid',
}

describe('presets', () => {
  const table: Array<[PresetName, string, string, string, string, string, string, string]> = [
    ['default', 'فروشگاه', '#4F46E5', '#F59E0B', 'lg', 'soft', 'calm', 'elevated'],
    ['digital', 'کالای دیجیتال', '#2563EB', '#F97316', 'lg', 'crisp', 'calm', 'elevated'],
    ['agro', 'بذر و کود', '#15803D', '#B45309', 'xl', 'soft', 'calm', 'flat'],
    ['boardgame', 'بازی فکری', '#7C3AED', '#FACC15', 'xl', 'soft', 'lively', 'elevated'],
    ['carpet', 'فرش', '#8B1E3F', '#C8A24A', 'md', 'soft', 'calm', 'flat'],
    ['paint', 'رنگ ساختمانی', '#0E7490', '#F43F5E', 'lg', 'crisp', 'lively', 'elevated'],
  ]

  it('exposes exactly the six presets', () => {
    expect([...PRESET_NAMES]).toEqual(table.map(([name]) => name))
    expect(Object.keys(PRESETS).sort()).toEqual([...PRESET_NAMES].sort())
  })

  it.each(table)(
    '%s matches the specified values',
    (name, label, primary, accent, radius, shadow, motion, cardStyle) => {
      expect(PRESETS[name]).toEqual({
        name,
        label,
        primary,
        accent,
        radius,
        shadow,
        motion,
        cardStyle,
      })
    },
  )
})

describe('resolveStoreConfig', () => {
  it('uses the preset values when there are no overrides', () => {
    const config = resolveStoreConfig(envWith({ STORE_PRESET: 'carpet' }))
    expect(config.preset).toBe('carpet')
    expect(config.presetLabel).toBe('فرش')
    expect(config.theme).toEqual({
      primary: '#8B1E3F',
      accent: '#C8A24A',
      radius: 'md',
      shadow: 'soft',
      font: 'vazirmatn',
      motion: 'calm',
      cardStyle: 'flat',
    })
  })

  it('passes the site and API URLs through', () => {
    const config = resolveStoreConfig(envWith())
    expect(config.siteUrl).toBe('https://shop.ir')
    expect(config.apiUrl).toBe('https://api.shop.ir')
  })

  it('lets THEME_* variables override the preset', () => {
    const config = resolveStoreConfig(
      envWith({
        STORE_PRESET: 'carpet',
        THEME_PRIMARY: '#123456',
        THEME_ACCENT: '#654321',
        THEME_RADIUS: 'xl',
        THEME_FONT: 'custom',
      }),
    )
    expect(config.theme.primary).toBe('#123456')
    expect(config.theme.accent).toBe('#654321')
    expect(config.theme.radius).toBe('xl')
    expect(config.theme.font).toBe('custom')
    expect(config.theme.shadow).toBe('soft')
  })

  it('selects Neshan only when NESHAN_MAP_KEY is set', () => {
    expect(resolveStoreConfig(envWith()).map).toEqual({ provider: 'osm', neshanKey: null })
    expect(resolveStoreConfig(envWith({ NESHAN_SERVICE_KEY: 'service' })).map.provider).toBe('osm')
    expect(resolveStoreConfig(envWith({ NESHAN_MAP_KEY: 'web.abc' })).map).toEqual({
      provider: 'neshan',
      neshanKey: 'web.abc',
    })
  })

  it('enables web push only with the full Firebase config', () => {
    const none = resolveStoreConfig(envWith())
    expect(none.features.webPush).toBe(false)
    expect(none.firebase).toBeNull()

    const { FIREBASE_APP_ID: _omit, ...partial } = firebase
    void _omit
    expect(resolveStoreConfig(envWith(partial)).features.webPush).toBe(false)

    const full = resolveStoreConfig(envWith(firebase))
    expect(full.features.webPush).toBe(true)
    expect(full.firebase).toEqual({
      apiKey: 'api',
      projectId: 'project',
      messagingSenderId: 'sender',
      appId: 'app',
      vapidKey: 'vapid',
    })
  })

  it('maps the FEATURE_* flags', () => {
    const config = resolveStoreConfig(envWith({ FEATURE_COMPARE: '0', FEATURE_PWA: 'false' }))
    expect(config.features).toEqual({
      compare: false,
      quickView: true,
      recentlyViewed: true,
      pwa: false,
      webPush: false,
    })
  })
})

describe('toPublicConfig', () => {
  it('drops apiUrl and exposes only the API origin as mediaOrigin', () => {
    const config = resolveStoreConfig(
      envWith({ FIREFLY_API_URL: 'https://api.shop.ir/v1/', FIREFLY_API_KEY: 'secret-key' }),
    )
    const pub = toPublicConfig(config)
    expect('apiUrl' in pub).toBe(false)
    expect(pub.mediaOrigin).toBe('https://api.shop.ir')
    expect(JSON.stringify(pub)).not.toContain('/v1')
    expect(JSON.stringify(pub)).not.toContain('secret-key')
  })

  it('keeps the rest of the config', () => {
    const config = resolveStoreConfig(envWith({ STORE_PRESET: 'agro', NESHAN_MAP_KEY: 'web.abc' }))
    const pub = toPublicConfig(config)
    expect(pub.preset).toBe('agro')
    expect(pub.siteUrl).toBe('https://shop.ir')
    expect(pub.theme).toEqual(config.theme)
    expect(pub.features).toEqual(config.features)
    expect(pub.map).toEqual(config.map)
    expect(pub.firebase).toBeNull()
  })

  it('sends exactly the allow-listed keys, even when the server config grows', () => {
    const config = resolveStoreConfig(envWith())
    const grown = { ...config, apiKey: 'secret-key' } as typeof config
    for (const pub of [toPublicConfig(config), toPublicConfig(grown)]) {
      expect(Object.keys(pub).sort()).toEqual(
        [
          'features',
          'firebase',
          'map',
          'mediaOrigin',
          'preset',
          'presetLabel',
          'siteUrl',
          'theme',
        ].sort(),
      )
    }
    expect(JSON.stringify(toPublicConfig(grown))).not.toContain('secret-key')
  })

  it('keeps a non-default port in mediaOrigin', () => {
    const config = resolveStoreConfig(parseServerEnv({}))
    expect(toPublicConfig(config).mediaOrigin).toBe('http://localhost:8000')
  })
})

describe('getStoreConfig (server accessor)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
    vi.doUnmock('server-only')
  })

  it('resolves from process.env once and memoizes', async () => {
    vi.stubEnv('FIREFLY_API_URL', 'https://api.shop.ir/')
    vi.stubEnv('SITE_URL', 'https://shop.ir/')
    vi.stubEnv('FIREFLY_API_KEY', 'k')
    vi.stubEnv('STORE_PRESET', 'paint')
    vi.resetModules()
    vi.doMock('server-only', () => ({}))
    const { getStoreConfig } = await import('@/config/store-config')
    const first = getStoreConfig()
    expect(first.preset).toBe('paint')
    expect(first.theme.primary).toBe('#0E7490')
    expect(getStoreConfig()).toBe(first)
  })
})
