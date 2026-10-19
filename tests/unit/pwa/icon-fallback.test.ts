// @vitest-environment node
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stubEnv } from '../bff/support'

// `/icons/<size>/` when sharp is missing or broken (Plan 5 Task 7, carried from Task 6's review):
// the route serves the bundled brand-neutral PNGs (src/features/pwa/fallback-icons.ts) instead
// of a 500, so the manifest's icons always load and the shop stays installable. A short max-age:
// the shop's own icon shows again soon after the deploy is fixed.

const mocks = vi.hoisted(() => ({
  settings: null as { name?: string; favicon?: string | null; logo?: string | null } | null,
}))
vi.mock('@/features/settings/api', () => ({ getSiteSettings: async () => mocks.settings }))

/** A sharp whose every call fails, as a broken native binary would (libvips cannot run). */
function brokenSharp() {
  const fail = () => {
    throw new Error('Something went wrong installing the "sharp" module')
  }
  return Object.assign(
    () => ({ metadata: fail, resize: fail, png: fail, composite: fail, stats: fail }),
    {},
  )
}

/** The route with `sharp` as `require('sharp')` answers it: a module, or a failure to load. */
async function routeWith(sharpModule: 'missing' | 'broken') {
  vi.resetModules()
  vi.doMock('server-only', () => ({}))
  vi.doMock('node:module', () => ({
    createRequire: () => (id: string) => {
      if (id !== 'sharp') throw new Error(`unexpected require: ${id}`)
      if (sharpModule === 'missing') throw new Error("Cannot find module 'sharp'")
      return brokenSharp()
    },
  }))
  return import('@/app/icons/[size]/route')
}

async function get(route: Awaited<ReturnType<typeof routeWith>>, size: string) {
  return route.GET(new Request(`https://shop.test/icons/${size}/`), {
    params: Promise.resolve({ size }),
  })
}

beforeEach(() => {
  stubEnv()
  mocks.settings = { name: 'فایرفلای', favicon: null, logo: null }
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.resetModules()
  vi.doUnmock('server-only')
  vi.doUnmock('node:module')
})

describe('the bundled fallback icons', () => {
  it.each([192, 512] as const)('%i: a PNG of that size, opaque, no brand colour', async (size) => {
    const { fallbackIcon } = await import('@/features/pwa/fallback-icons')
    const png = fallbackIcon(size)
    const meta = await sharp(png).metadata()
    expect([meta.format, meta.width, meta.height]).toEqual(['png', size, size])
    expect(meta.hasAlpha).toBe(false)
  })
})

describe('sharp cannot load or fails', () => {
  it.each([
    ['missing', { name: 'فایرفلای', favicon: null, logo: null }],
    ['missing', { name: 'فایرفلای', favicon: 'https://api.test/media/f.png', logo: null }],
    ['broken', { name: 'فایرفلای', favicon: null, logo: null }],
    ['broken', { name: 'فایرفلای', favicon: null, logo: 'https://api.test/media/l.png' }],
  ] as const)('sharp %s (settings %o): the bundled icon, never a 500', async (state, settings) => {
    mocks.settings = { ...settings }
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(
        new Uint8Array(
          await sharp({ create: { width: 256, height: 256, channels: 3, background: '#ff0000' } })
            .png()
            .toBuffer(),
        ),
        { headers: { 'content-type': 'image/png' } },
      )
    })
    const route = await routeWith(state)
    const { fallbackIcon } = await import('@/features/pwa/fallback-icons')
    for (const size of [192, 512] as const) {
      const response = await get(route, String(size))
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('image/png')
      expect(response.headers.get('cache-control')).toBe('public, max-age=300')
      expect(Buffer.from(await response.arrayBuffer()).equals(fallbackIcon(size))).toBe(true)
    }
    // Said once, in a fixed sentence (no URL, no settings).
    expect(console.error).toHaveBeenCalledWith(
      '[icons] sharp could not make the icon; serving the bundled one:',
      'Error',
    )
  })

  it('the bundled icon is kept in memory five minutes only: then sharp is tried again', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const route = await routeWith('broken')
      await get(route, '192')
      await get(route, '192')
      expect(console.error).toHaveBeenCalledTimes(1)
      vi.setSystemTime(Date.now() + 6 * 60_000)
      await get(route, '192')
      expect(console.error).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a configuration that cannot be read: the bundled icon all the same', async () => {
    vi.resetModules()
    vi.doMock('server-only', () => ({}))
    vi.doMock('@/config/store-config', () => ({
      getStoreConfig: () => {
        throw new Error('THEME_PRIMARY is not a colour')
      },
    }))
    try {
      const route = await import('@/app/icons/[size]/route')
      const response = await get(route, '512')
      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('public, max-age=300')
    } finally {
      vi.doUnmock('@/config/store-config')
    }
  })

  it('any other size is still a 404', async () => {
    const route = await routeWith('missing')
    expect((await get(route, '1024')).status).toBe(404)
  })
})
