import { describe, expect, it, vi } from 'vitest'
import { cartWrite, type BackendLog, type CartWriteSpec } from '../../e2e/support/cart-write'
import { cart, line, lockRecord, NON_JSON } from './cart-write-support'

// The e2e helper for cart writes driven through the UI (tests/e2e/support/cart-write.ts): the
// dev backend's SQLite lock («database is locked», a 500) is retried once, after checking that
// the failed write changed nothing; anything else fails the test.

const ADD: CartWriteSpec = { method: 'POST', path: 'cart/item/add/', label: 'add' }

interface Planned {
  status: number
  body: string
  method?: string
  path?: string
  data?: unknown
}

function response({ status, body, method = 'POST', path = ADD.path, data = null }: Planned) {
  return {
    url: () => `http://localhost:3000/api/bff/${path}`,
    status: () => status,
    ok: () => status >= 200 && status < 300,
    text: async () => body,
    request: () => ({ method: () => method, postDataJSON: () => data }),
  }
}
type FakeResponse = ReturnType<typeof response>
type WritePage = Parameters<typeof cartWrite>[0]

/**
 * A page whose writes answer from `planned`, one per user action, and whose cart reads answer
 * from `carts` (the last one repeats).
 */
function fakePage(planned: Planned[], carts: unknown[]) {
  const waiters: { match: (r: FakeResponse) => boolean; resolve: (r: FakeResponse) => void }[] = []
  const reads = [...carts]
  const page = {
    waitForResponse: vi.fn((match: (r: FakeResponse) => boolean) => {
      return new Promise<FakeResponse>((resolve) => waiters.push({ match, resolve }))
    }),
    request: {
      get: vi.fn(async () => {
        const data = reads.length > 1 ? reads.shift() : reads[0]
        return { ok: () => true, status: () => 200, json: async () => ({ data }) }
      }),
    },
  }
  /** The visitor's action: the next planned answer arrives. */
  const act = vi.fn(async () => {
    const next = response(planned.shift()!)
    const index = waiters.findIndex((waiter) => waiter.match(next))
    if (index >= 0) waiters.splice(index, 1)[0]!.resolve(next)
  })
  return { page: page as unknown as typeof page & WritePage, act }
}

const noLog: BackendLog = { size: async () => 0, since: async () => '' }
const logWith = (text: string): BackendLog => ({ size: async () => 100, since: async () => text })

describe('cartWrite', () => {
  it('returns the answer of a write that went through, after one action', async () => {
    const { page, act } = fakePage([{ status: 200, body: '{}' }], [cart([])])
    const answer = await cartWrite(page, ADD, act, { log: noLog })
    expect(answer.status()).toBe(200)
    expect(act).toHaveBeenCalledTimes(1)
  })

  it('statuses listed: an answer among them is returned (a refusal the test reads)', async () => {
    const coupon: CartWriteSpec = {
      method: 'POST',
      path: 'cart/coupon/apply/',
      status: [200, 400],
      label: 'a coupon',
    }
    const { page, act } = fakePage([{ status: 400, body: '{}', path: coupon.path }], [cart([])])
    const answer = await cartWrite(page, coupon, act, { log: noLog })
    expect(answer.status()).toBe(400)
    expect(act).toHaveBeenCalledTimes(1)
  })

  it('statuses listed: an answer outside them still fails, saying what came', async () => {
    const coupon: CartWriteSpec = {
      method: 'POST',
      path: 'cart/coupon/apply/',
      status: [200, 400],
      label: 'a coupon',
    }
    const { page, act } = fakePage(
      [{ status: 409, body: 'conflict', path: coupon.path }],
      [cart([])],
    )
    await expect(cartWrite(page, coupon, act, { log: noLog })).rejects.toThrow(
      /a coupon: the BFF answered 409 conflict/,
    )
  })

  it('a locked database: checks the cart is unchanged, warns, and repeats the action once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { page, act } = fakePage(
      [
        { status: 500, body: NON_JSON },
        { status: 200, body: '{}' },
      ],
      [cart([line(1, 1)])],
    )
    const answer = await cartWrite(page, ADD, act, { log: logWith(lockRecord(ADD.path)) })
    expect(answer.status()).toBe(200)
    expect(act).toHaveBeenCalledTimes(2)
    expect(page.request.get).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0])).toMatch(/add.*500.*non_json_response/s)
    warn.mockRestore()
  })

  it('repeats with `retry` when the action itself cannot be repeated', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { page, act } = fakePage(
      [
        { status: 500, body: `… ${'database is locked'} …` },
        { status: 200, body: '{}' },
      ],
      [cart([])],
    )
    const retry = vi.fn(() => act())
    await cartWrite(page, ADD, act, { retry, log: noLog })
    expect(retry).toHaveBeenCalledTimes(1)
    expect(act).toHaveBeenCalledTimes(2)
    vi.restoreAllMocks()
  })

  it('fails when the failed write changed the cart', async () => {
    const { page, act } = fakePage(
      [{ status: 500, body: NON_JSON }],
      [cart([]), cart([line(1, 1)])],
    )
    await expect(cartWrite(page, ADD, act, { log: logWith(lockRecord(ADD.path)) })).rejects.toThrow(
      /add.*changed/s,
    )
    expect(act).toHaveBeenCalledTimes(1)
  })

  it('compares with the cart it is given', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { page, act } = fakePage(
      [
        { status: 500, body: NON_JSON },
        { status: 200, body: '{}' },
      ],
      [cart([line(3, 1)])],
    )
    const before = cart([line(3, 1)])
    await cartWrite(page, ADD, act, { before, log: logWith(lockRecord(ADD.path)) })
    expect(page.request.get).toHaveBeenCalledTimes(1)
    vi.restoreAllMocks()
  })

  it('or with the one a function gives once it is known (a write that follows another)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { page, act } = fakePage(
      [
        { status: 500, body: NON_JSON },
        { status: 500, body: NON_JSON },
      ],
      [cart([line(3, 1)])],
    )
    const known = vi.fn(async () => cart([line(4, 1)]))
    await expect(
      cartWrite(page, ADD, act, { before: known, log: logWith(lockRecord(ADD.path)) }),
    ).rejects.toThrow(/changed/)
    expect(known).toHaveBeenCalledTimes(1)
    vi.restoreAllMocks()
  })

  it('any other failure fails at once, with what the BFF answered', async () => {
    const { page, act } = fakePage([{ status: 500, body: NON_JSON }], [cart([])])
    await expect(cartWrite(page, ADD, act, { log: logWith('') })).rejects.toThrow(
      /add.*500.*non_json_response/s,
    )
    const refused = fakePage([{ status: 400, body: 'cart_item_out_of_stock' }], [cart([])])
    await expect(
      cartWrite(refused.page, ADD, refused.act, { log: logWith(lockRecord(ADD.path)) }),
    ).rejects.toThrow(/400.*cart_item_out_of_stock/s)
    expect(act).toHaveBeenCalledTimes(1)
  })

  it('a second failure fails the test', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { page, act } = fakePage(
      [
        { status: 500, body: NON_JSON },
        { status: 500, body: NON_JSON },
      ],
      [cart([])],
    )
    await expect(cartWrite(page, ADD, act, { log: logWith(lockRecord(ADD.path)) })).rejects.toThrow(
      /again/,
    )
    expect(act).toHaveBeenCalledTimes(2)
    vi.restoreAllMocks()
  })

  it('takes the refusal a test expects as the answer', async () => {
    const coupon: CartWriteSpec = { method: 'POST', path: 'cart/coupon/apply/', status: 400 }
    const { page, act } = fakePage(
      [{ status: 400, body: 'coupon_invalid', path: coupon.path }],
      [cart([])],
    )
    expect((await cartWrite(page, coupon, act, { log: noLog })).status()).toBe(400)
    const locked = fakePage([{ status: 200, body: '{}', path: coupon.path }], [cart([])])
    await expect(cartWrite(locked.page, coupon, locked.act, { log: noLog })).rejects.toThrow(/200/)
  })

  it('waits for this write only: its method, its path, its body', async () => {
    const put: CartWriteSpec = {
      method: 'PUT',
      path: 'cart/item/7/',
      body: (data) => (data as { quantity?: number } | null)?.quantity === 2,
    }
    const { page, act } = fakePage([], [cart([])])
    const settled = vi.fn()
    void cartWrite(page, put, async () => {}, { log: noLog }).then(settled)
    await vi.waitFor(() => expect(page.waitForResponse).toHaveBeenCalled())
    const match = page.waitForResponse.mock.calls[0]![0] as (r: FakeResponse) => boolean
    const of = (planned: Partial<Planned>) =>
      match(response({ status: 200, body: '{}', method: 'PUT', path: put.path, ...planned }))
    expect(of({ data: { quantity: 2 } })).toBe(true)
    expect(of({ data: { quantity: 3 } })).toBe(false)
    expect(of({ method: 'POST', data: { quantity: 2 } })).toBe(false)
    expect(of({ path: 'cart/item/77/', data: { quantity: 2 } })).toBe(false)
    expect(act).not.toHaveBeenCalled()
  })
})
