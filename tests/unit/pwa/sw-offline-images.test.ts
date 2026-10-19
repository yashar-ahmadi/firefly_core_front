// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { CACHES, shop, SOURCE } from './sw-offline-support'
import { served, subresource, worker } from './sw-scope'

// Images in `/sw.js`'s offline caching (Plan 5 Task 6): the shop's own (`/_next/image`, `/media/`
// and `/static/` through the proxy) stale while revalidate, at most 200 kept, the least recently
// stored going first.

const image = (path: string) => subresource(path, 'image')
const optimized = (n: number) => image(`/_next/image/?url=%2Fmedia%2Fp${n}.jpg&w=384&q=75`)

async function ready() {
  const state = { online: true }
  const sw = worker(SOURCE, { network: shop(state) })
  await sw.fire('activate')
  return { sw, state, kept: async () => (await sw.caches.open(CACHES.images)).paths() }
}

describe('images (stale while revalidate)', () => {
  it('the first view is the network’s, kept; the next is the copy, read again behind it', async () => {
    const { sw, kept } = await ready()
    const first = await sw.request(image('/media/p1.jpg'))
    expect(await first?.text()).toBe('image https://shop.test/media/p1.jpg')
    expect(await kept()).toEqual(['/media/p1.jpg'])
    sw.fetch.mockResolvedValueOnce(served('a newer picture'))
    const second = await sw.request(image('/media/p1.jpg'))
    expect(await second?.text()).toBe('image https://shop.test/media/p1.jpg')
    expect(sw.fetch).toHaveBeenCalledTimes(2)
    // The copy read behind it replaces the old one, for the next view.
    expect(await (await (await sw.caches.open(CACHES.images)).match('/media/p1.jpg'))?.text()).toBe(
      'a newer picture',
    )
  })

  it.each([
    ['storing it', 'put'],
    ['trimming the cache', 'keys'],
  ] as const)(
    'a picture never seen reaches the page at once: %s happens behind it',
    async (_, step) => {
      const { sw, kept } = await ready()
      const cache = await sw.caches.open(CACHES.images)
      const original = cache[step].bind(cache) as (...args: unknown[]) => Promise<unknown>
      let release: () => void = () => {}
      const held = new Promise<void>((resolve) => (release = resolve))
      cache[step] = (async (...args: unknown[]) => {
        await held
        return original(...args)
      }) as never
      const { answer, settled } = sw.dispatch('fetch', { request: image('/media/p1.jpg') })
      const first = await Promise.race([
        answer,
        new Promise<'waiting'>((resolve) => setTimeout(resolve, 50, 'waiting')),
      ])
      expect(first, 'the page waited for the cache').not.toBe('waiting')
      expect(await (first as Response).text()).toBe('image https://shop.test/media/p1.jpg')
      release()
      await settled()
      expect(await kept()).toEqual(['/media/p1.jpg'])
    },
  )

  it('a cache that refuses the picture (storage full): the page still gets it', async () => {
    const { sw, kept } = await ready()
    const cache = await sw.caches.open(CACHES.images)
    cache.put = async () => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    }
    const response = await sw.request(image('/media/p1.jpg'))
    expect(await response?.text()).toBe('image https://shop.test/media/p1.jpg')
    expect(await kept()).toEqual([])
  })

  it('offline: the copy kept; a picture never seen fails as it would', async () => {
    const { sw, state } = await ready()
    await sw.request(optimized(1))
    state.online = false
    expect(await (await sw.request(optimized(1)))?.text()).toContain('image')
    await expect(sw.request(optimized(2))).rejects.toThrow(TypeError)
  })

  it('the API’s files through the proxy (/static/) count too', async () => {
    const { sw, kept } = await ready()
    sw.fetch.mockResolvedValueOnce(served('default product picture'))
    await sw.request(image('/static/defaults/default.png'))
    expect(await kept()).toEqual(['/static/defaults/default.png'])
  })

  it('at most 200 kept: the least recently stored go first', async () => {
    const { sw, kept } = await ready()
    for (let n = 0; n < 205; n += 1) await sw.request(optimized(n))
    const paths = await kept()
    expect(paths).toHaveLength(200)
    expect(paths[0]).toContain('p5.jpg')
    // A picture seen again is stored again (its copy read behind it): last to go now.
    await sw.request(optimized(5))
    await sw.request(optimized(300))
    const after = await kept()
    expect(after).toHaveLength(200)
    expect(after.some((path) => path.includes('p6.jpg'))).toBe(false)
    expect(after.at(-2)).toContain('p5.jpg')
  })

  it.each([
    ['no-store', { headers: { 'cache-control': 'no-store' } }],
    ['private', { headers: { 'cache-control': 'private' } }],
    ['an error', { status: 500 }],
    ['opaque', { type: 'opaque' as ResponseType }],
  ])('an image answer that is %s is shown, never kept', async (_, answer) => {
    const { sw, kept } = await ready()
    sw.fetch.mockResolvedValueOnce(served('x', answer))
    await sw.request(image('/media/p9.jpg'))
    expect(await kept()).toEqual([])
  })
})
