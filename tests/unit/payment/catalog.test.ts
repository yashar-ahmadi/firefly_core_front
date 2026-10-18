import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPaymentCatalog } from '@/features/payment/catalog'
import { ApiError } from '@/lib/api/errors'
import { gateways, methods } from './fixtures'

// The payment catalog for `/checkout/` (order digest §1.6, §10): both lists from the Next.js
// data cache, 60 s, anonymous and without the visitor's IP (one copy for every shopper: the
// lists would otherwise eat the shared 240/h `payment_status` budget), the operator's route
// texts sanitised on the server; a list that cannot be read is null, never a thrown page.

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/api/server', () => ({ apiFetch: mocks.apiFetch }))
vi.mock('@/config/store-config', () => ({
  getStoreConfig: () => ({ apiUrl: 'http://localhost:8000', siteUrl: 'http://localhost:3000' }),
}))

const page = (results: unknown[]) => ({
  data: { count: results.length, results },
  msg: '',
  status: 200,
})

beforeEach(() => {
  mocks.apiFetch.mockReset()
})

describe('getPaymentCatalog', () => {
  it('reads both lists cached for 60 s, anonymously, and sanitises the route texts', async () => {
    const [bank, ...rest] = methods()
    const unsafe = {
      ...bank!,
      description: 'امن <script>alert(1)</script><a href="/page/terms/" onclick="x()">قوانین</a>',
      instruction: '<img src="/media/a.png" onerror="x()">',
    }
    mocks.apiFetch.mockImplementation((path: string) =>
      Promise.resolve(page(path === 'payment/method/list/' ? [unsafe, ...rest] : gateways())),
    )
    const catalog = await getPaymentCatalog()
    expect(mocks.apiFetch).toHaveBeenCalledTimes(2)
    for (const [, options] of mocks.apiFetch.mock.calls) {
      expect(options).toMatchObject({ revalidate: 60 })
      expect(options).not.toHaveProperty('forwardedFor')
      expect(options).not.toHaveProperty('token')
    }
    expect(catalog.gateways).toEqual(gateways())
    const view = catalog.methods![0]!
    expect(view.description).not.toMatch(/script|onclick/)
    expect(view.description).toContain('قوانین')
    expect(view.instruction).toContain('http://localhost:8000/media/a.png')
    expect(view.instruction).not.toContain('onerror')
    // A plain text stays as it is; an empty one is null.
    expect(catalog.methods![1]!.description).toBe(methods()[1]!.description)
    expect(catalog.methods![1]!.instruction).toBeNull()
  })

  it('a list that cannot be read is null (logged without its URL), the other still served', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.apiFetch.mockImplementation((path: string) =>
      path === 'payment/method/list/'
        ? Promise.reject(new ApiError({ status: 503, code: 'http_503' }))
        : Promise.resolve(page(gateways())),
    )
    const catalog = await getPaymentCatalog()
    expect(catalog.methods).toBeNull()
    expect(catalog.gateways).toEqual(gateways())
    expect(error).toHaveBeenCalledWith('[payment] payment/method/list/ failed:', '503 http_503')
    error.mockRestore()
  })
})
