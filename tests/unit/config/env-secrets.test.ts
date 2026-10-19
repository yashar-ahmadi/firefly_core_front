import { describe, expect, it, vi } from 'vitest'
import { parseServerEnv } from '@/config/env-schema'

// The environment holds secrets (the API key, the Firebase and Neshan keys): what parsing it
// throws or prints names variables and rules, never a value.

const base = {
  FIREFLY_API_URL: 'https://api.shop.ir/',
  SITE_URL: 'https://shop.ir/',
  FIREFLY_API_KEY: 'k',
}

describe('parseServerEnv and secrets', () => {
  it('never echoes a secret value in what it throws or prints', () => {
    const secrets = {
      FIREFLY_API_KEY: 'sk-live-0001',
      FIREBASE_API_KEY: 'fb-api-0002',
      FIREBASE_MESSAGING_SENDER_ID: '0003',
      FIREBASE_APP_ID: '1:0004:web:x',
      FIREBASE_VAPID_KEY: 'vapid-0005',
      NESHAN_MAP_KEY: 'web.0006',
      NESHAN_SERVICE_KEY: 'service.0007',
    }
    const printed: string[] = []
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        printed.push(args.map(String).join(' '))
      }),
    )
    const thrown: string[] = []
    const attempt = (raw: Record<string, string>) => {
      try {
        parseServerEnv(raw)
      } catch (error) {
        const own = JSON.stringify(error, Object.getOwnPropertyNames(error))
        thrown.push(`${String(error)}\n${(error as Error).stack ?? ''}\n${own}`)
      }
    }
    try {
      // A partial Firebase set: parsed, with one warning.
      attempt({ ...base, ...secrets, FIREBASE_PROJECT_ID: '' })
      // Every secret set, beside an invalid colour.
      attempt({ ...base, ...secrets, THEME_PRIMARY: 'nope' })
      // Secret values pasted into every validated variable by mistake.
      attempt({
        NODE_ENV: 'production',
        FIREFLY_API_URL: secrets.FIREFLY_API_KEY,
        SITE_URL: `https://shop.ir/?key=${secrets.FIREBASE_API_KEY}`,
        STORE_PRESET: secrets.FIREBASE_APP_ID,
        THEME_PRIMARY: secrets.FIREBASE_VAPID_KEY,
        THEME_RADIUS: secrets.NESHAN_MAP_KEY,
        THEME_FONT: secrets.NESHAN_SERVICE_KEY,
        CLIENT_IP_HEADER: `${secrets.FIREBASE_MESSAGING_SENDER_ID} x`,
        FEATURE_PWA: secrets.FIREFLY_API_KEY,
      })
      attempt({ ...base, FIREFLY_API_URL: `https://api.shop.ir/?token=${secrets.FIREFLY_API_KEY}` })
    } finally {
      for (const spy of spies) spy.mockRestore()
    }
    expect(thrown).toHaveLength(3)
    expect(printed).toHaveLength(1)
    for (const text of [...thrown, ...printed]) {
      for (const secret of Object.values(secrets)) expect(text).not.toContain(secret)
    }
  })
})
