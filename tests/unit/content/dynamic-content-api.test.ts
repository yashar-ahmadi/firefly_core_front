import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearMissing } from '@/features/catalog/loaders/missing'
import { getDynamicContent } from '@/features/content/dynamic/api'
import { ApiError } from '@/lib/api/errors'
import { TERMS } from './dynamic-fixtures'

// `global/dynamic-content/<key>/` (auth-settings digest §7.9): one anonymous read cached 300 s,
// the same for every visitor (no token, no visitor IP); a 404 (no such slot, or switched off) is
// remembered a minute in process memory, as the catalog's are; nothing ever throws.

const apiFetch = vi.hoisted(() => vi.fn())
vi.mock('server-only', () => ({}))
vi.mock('@/lib/api/server', () => ({ apiFetch }))

const ok = (data: unknown) =>
  Promise.resolve({ data, msg: '', status: 200, headers: new Headers() })
const notFound = () =>
  Promise.reject(new ApiError({ status: 404, code: 'not_found', detail: 'یافت نشد.' }))

let log: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  apiFetch.mockReset()
  clearMissing()
  log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('getDynamicContent', () => {
  it('reads the slot anonymously, cached 300 s and tagged, never with a token or an IP', async () => {
    apiFetch.mockReturnValue(ok(TERMS))
    expect(await getDynamicContent('terms')).toEqual(TERMS)
    expect(apiFetch).toHaveBeenCalledTimes(1)
    expect(apiFetch.mock.calls[0]).toEqual([
      'global/dynamic-content/terms',
      { revalidate: 300, tags: ['dynamic-content:terms', 'dynamic-content'] },
    ])
  })

  it('a 404 is null, and remembered: no second read within the minute', async () => {
    apiFetch.mockImplementation(notFound)
    expect(await getDynamicContent('home')).toBeNull()
    expect(await getDynamicContent('home')).toBeNull()
    expect(apiFetch).toHaveBeenCalledTimes(1)
    expect(log).not.toHaveBeenCalled()
  })

  it.each([
    ['a 5xx', () => Promise.reject(new ApiError({ status: 502, code: 'http_502' })), '502'],
    ['no answer', () => Promise.reject(ApiError.network(new TypeError('fetch failed'))), '0'],
    ['a throw', () => Promise.reject(new Error('boom at https://api.internal/x')), 'error'],
  ])(
    '%s is null, logged with the status alone, and read again next time',
    async (_, answer, status) => {
      apiFetch.mockImplementation(answer)
      expect(await getDynamicContent('cart')).toBeNull()
      expect(log).toHaveBeenCalledWith('[dynamic-content] cart:', status)
      expect(JSON.stringify(log.mock.calls)).not.toContain('api.internal')
      await getDynamicContent('cart')
      expect(apiFetch).toHaveBeenCalledTimes(2)
    },
  )

  it('reads only slug-style keys (one path segment)', async () => {
    for (const key of ['', 'a/b', '..', 'Terms Page', 'x?y']) {
      expect(await getDynamicContent(key)).toBeNull()
    }
    expect(apiFetch).not.toHaveBeenCalled()
  })
})
