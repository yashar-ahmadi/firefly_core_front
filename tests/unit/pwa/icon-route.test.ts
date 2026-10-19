// @vitest-environment node
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stubEnv, type FetchSpy } from '../bff/support'

// `/icons/<size>/` (src/app/icons/[size]/route.ts), the manifest's icons: 192 and 512 px PNGs
// made with sharp from the settings' favicon (when it is large enough) or logo, read from the API
// host alone (the favicon route's guard: src/features/settings/api-image.ts), else a monogram in
// the brand colour. Any other size is a 404.

const mocks = vi.hoisted(() => ({
  settings: null as { name?: string; favicon?: string | null; logo?: string | null } | null,
}))
vi.mock('@/features/settings/api', () => ({ getSiteSettings: async () => mocks.settings }))

let fetchSpy: FetchSpy

async function load() {
  vi.resetModules()
  vi.doMock('server-only', () => ({}))
  return import('@/app/icons/[size]/route')
}

async function get(size: string) {
  const { GET } = await load()
  return GET(new Request(`https://shop.test/icons/${size}/`), {
    params: Promise.resolve({ size }),
  })
}

const square = (size: number, color: string) =>
  sharp({ create: { width: size, height: size, channels: 3, background: color } })
    .png()
    .toBuffer()

/** A real PNG over 2 MB (noise compresses badly): decodable, so only the cap refuses it. */
const noise = async () => {
  const png = await sharp({
    create: {
      width: 1100,
      height: 1100,
      channels: 3,
      background: '#ff0000',
      noise: { type: 'gaussian', mean: 128, sigma: 60 },
    },
  })
    .png({ compressionLevel: 0 })
    .toBuffer()
  expect(png.byteLength).toBeGreaterThan(2 * 1024 * 1024)
  return png
}

/** A body streamed in chunks, with no Content-Length. */
const streamOf = (bytes: Buffer) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (let at = 0; at < bytes.length; at += 64 * 1024) {
        controller.enqueue(new Uint8Array(bytes.subarray(at, at + 64 * 1024)))
      }
      controller.close()
    },
  })

const image = (bytes: Buffer, type = 'image/png', status = 200) =>
  new Response(new Uint8Array(bytes), { status, headers: { 'content-type': type } })

/** The pixel at (x, y), as `#rrggbb`. */
async function pixel(png: ArrayBuffer, x: number, y: number) {
  const { data, info } = await sharp(Buffer.from(png)).raw().toBuffer({ resolveWithObject: true })
  const at = (y * info.width + x) * info.channels
  return `#${[...data.subarray(at, at + 3)].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

const FAVICON = 'https://api.test/media/site/favicon.png'
const LOGO = 'https://api.test/media/site/logo.png'

beforeEach(() => {
  stubEnv()
  vi.stubEnv('THEME_PRIMARY', '#0E7490')
  mocks.settings = { name: 'فایرفلای', favicon: FAVICON, logo: LOGO }
  fetchSpy = vi.spyOn(globalThis, 'fetch')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.resetModules()
  vi.doUnmock('server-only')
})

describe('/icons/<size>/', () => {
  it.each(['0', '191', '256', '1024', 'abc', '192.png', '512x512', ''])('%s: 404', async (size) => {
    const res = await get(size)
    expect(res.status).toBe(404)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it.each([192, 512])('%i: a square PNG of that size, typed and never sniffed', async (size) => {
    fetchSpy.mockImplementation(async () => image(await square(256, '#ff0000')))
    const res = await get(String(size))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('cache-control')).toBe('public, max-age=86400')
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata()
    expect([meta.format, meta.width, meta.height]).toEqual(['png', size, size])
  })

  it('from a favicon large enough: centred on white, inside the maskable safe zone', async () => {
    fetchSpy.mockImplementation(async () => image(await square(256, '#ff0000')))
    const png = await (await get('512')).arrayBuffer()
    expect(await pixel(png, 256, 256)).toBe('#ff0000')
    // The corners and the edge band stay white: nothing outside the central circle.
    expect(await pixel(png, 2, 2)).toBe('#ffffff')
    expect(await pixel(png, 256, 60)).toBe('#ffffff')
    expect(fetchSpy.mock.calls.map(([url]) => String(url))).toEqual([FAVICON])
  })

  it('a favicon too small for the icon: the logo instead', async () => {
    fetchSpy.mockImplementation(async (url) =>
      image(String(url) === FAVICON ? await square(32, '#ff0000') : await square(400, '#0000ff')),
    )
    const png = await (await get('192')).arrayBuffer()
    expect(await pixel(png, 96, 96)).toBe('#0000ff')
  })

  it('no favicon or logo: the monogram, the shop’s first letter on its brand colour', async () => {
    mocks.settings = { name: 'فایرفلای', favicon: null, logo: null }
    const res = await get('512')
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600')
    const png = await res.arrayBuffer()
    expect(await pixel(png, 4, 4)).toBe('#0e7490')
    expect(await pixel(png, 508, 508)).toBe('#0e7490')
    // The letter: white pixels in the middle.
    const { data, info } = await sharp(Buffer.from(png))
      .extract({ left: 128, top: 128, width: 256, height: 256 })
      .raw()
      .toBuffer({ resolveWithObject: true })
    let white = 0
    for (let at = 0; at < data.length; at += info.channels) {
      if (data[at]! > 240 && data[at + 1]! > 240 && data[at + 2]! > 240) white += 1
    }
    expect(white).toBeGreaterThan(500)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('without settings: the monogram of the preset’s label', async () => {
    mocks.settings = null
    const res = await get('192')
    expect(res.status).toBe(200)
    expect(await pixel(await res.arrayBuffer(), 1, 1)).toBe('#0e7490')
  })

  it('one read per source and size: the next request is served from memory', async () => {
    fetchSpy.mockImplementation(async () => image(await square(256, '#ff0000')))
    const { GET } = await load()
    const context = { params: Promise.resolve({ size: '512' }) }
    await GET(new Request('https://shop.test/icons/512/'), context)
    await GET(new Request('https://shop.test/icons/512/'), context)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

describe('the source is read from the API host alone (SSRF)', () => {
  it('a settings URL on another host is read on the API host, its path and query only', async () => {
    mocks.settings = { name: 'x', favicon: 'https://evil.test/media/f.png?v=2', logo: null }
    fetchSpy.mockImplementation(async () => image(await square(256, '#ff0000')))
    await get('192')
    expect(fetchSpy.mock.calls.map(([url]) => String(url))).toEqual([
      'https://api.test/media/f.png?v=2',
    ])
    const init = fetchSpy.mock.calls[0]![1]!
    expect(init.redirect).toBe('manual')
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('a path the API serves no files from is never read', async () => {
    mocks.settings = {
      name: 'x',
      favicon: 'https://api.test/admin/',
      logo: 'http://169.254.169.254/latest/',
    }
    const res = await get('192')
    expect(res.status).toBe(200)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it.each([
    ['a redirect (not followed)', async () => image(Buffer.from(''), 'text/html', 302)],
    ['an SVG', async () => image(Buffer.from('<svg/>'), 'image/svg+xml')],
    ['HTML', async () => image(Buffer.from('<html/>'), 'text/html')],
    [
      'a picture over 2 MB, as its length says',
      async () => {
        const png = await noise()
        return new Response(new Uint8Array(png), {
          headers: { 'content-type': 'image/png', 'content-length': String(png.byteLength) },
        })
      },
    ],
    [
      'a picture over 2 MB, its length undeclared',
      async () =>
        new Response(streamOf(await noise()), { headers: { 'content-type': 'image/png' } }),
    ],
    ['bytes that are no image', async () => image(Buffer.from('not a png'), 'image/png')],
    ['no answer', async () => Promise.reject(new TypeError('fetch failed'))],
  ])('%s: the monogram', async (_, answer) => {
    fetchSpy.mockImplementation(answer)
    const res = await get('192')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600')
    expect(await pixel(await res.arrayBuffer(), 1, 1)).toBe('#0e7490')
  })
})
