// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A blog listing page past its last (Plan 5 Task 7): the API's 404 («صفحه نامعتبر») makes the page
// a 404, and is remembered for a minute (the negative cache, as for the catalog's listings): the
// same page asked for again costs no API call.

const apiFetch = vi.fn()

/** The loaders on a request; `keep` carries the remembered 404s (and their error class) over. */
interface Kept {
  missing: typeof import('@/features/catalog/loaders/missing')
  errors: typeof import('@/lib/api/errors')
}

async function load(keep?: Kept): Promise<{
  api: typeof import('@/features/blog/api')
  errors: Kept['errors']
  next: () => ReturnType<typeof load>
}> {
  vi.resetModules()
  vi.doMock('server-only', () => ({}))
  vi.doMock('@/lib/api/server', () => ({ apiFetch }))
  vi.doMock('next/headers', () => ({ headers: async () => new Headers() }))
  if (keep) {
    vi.doMock('@/features/catalog/loaders/missing', () => keep.missing)
    vi.doMock('@/lib/api/errors', () => keep.errors)
  }
  const api = await import('@/features/blog/api')
  const missing = await import('@/features/catalog/loaders/missing')
  const errors = await import('@/lib/api/errors')
  return { api, errors, next: () => load({ missing, errors }) }
}

const pastLast = (errors: typeof import('@/lib/api/errors')) =>
  errors.ApiError.fromBody(404, {
    msg: 'موردی با این مشخصات پیدا نشد.',
    data: { errors: [{ code: 'not_found', detail: 'صفحه نامعتبر', attr: null }] },
  })

beforeEach(() => {
  vi.stubEnv('FIREFLY_API_URL', 'https://api.test')
  vi.stubEnv('SITE_URL', 'https://shop.test')
  apiFetch.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
  for (const name of [
    'server-only',
    '@/lib/api/server',
    'next/headers',
    '@/features/catalog/loaders/missing',
    '@/lib/api/errors',
  ]) {
    vi.doUnmock(name)
  }
})

describe('a blog listing page past its last', () => {
  it('a 404 remembered a minute: asked for again, no API call', async () => {
    const first = await load()
    apiFetch.mockRejectedValue(pastLast(first.errors))
    await expect(first.api.getBlogPosts({ page: 99 })).rejects.toMatchObject({ status: 404 })
    const second = await first.next()
    await expect(second.api.getBlogPosts({ page: 99 })).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    })
    expect(
      second.errors.isApiNotFound(await second.api.getBlogPosts({ page: 99 }).catch((e) => e)),
    ).toBe(true)
    expect(apiFetch).toHaveBeenCalledTimes(1)
  })

  it('a category’s page and another page are asked for on their own', async () => {
    const first = await load()
    apiFetch.mockRejectedValue(pastLast(first.errors))
    await first.api.getBlogPosts({ page: 99 }).catch(() => undefined)
    const second = await first.next()
    await second.api.getBlogPosts({ page: 99, category: 'tutorial' }).catch(() => undefined)
    await second.api.getBlogPosts({ page: 98 }).catch(() => undefined)
    expect(apiFetch).toHaveBeenCalledTimes(3)
  })

  it('never remembers another failure (the blog switched off, a 500)', async () => {
    const first = await load()
    apiFetch.mockRejectedValue(new first.errors.ApiError({ status: 500, code: 'server_error' }))
    await first.api.getBlogPosts({ page: 99 }).catch(() => undefined)
    await (await first.next()).api.getBlogPosts({ page: 99 }).catch(() => undefined)
    expect(apiFetch).toHaveBeenCalledTimes(2)
  })
})
