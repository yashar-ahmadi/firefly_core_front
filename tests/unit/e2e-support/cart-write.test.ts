import { describe, expect, it, vi } from 'vitest'
import {
  cartState,
  cartWrite,
  lockLogged,
  type BackendLog,
  type CartWriteSpec,
} from '../../e2e/support/cart-write'

// The e2e helper for cart writes driven through the UI (tests/e2e/support/cart-write.ts): the
// dev backend's SQLite lock («database is locked», a 500) is retried once, after checking that
// the failed write changed nothing; anything else fails the test.

const ADD: CartWriteSpec = { method: 'POST', path: 'cart/item/add/', label: 'add' }

/** The dev server's log record of a locked write, as /tmp/backend.log has it. */
const lockRecord = (path: string) =>
  [
    `[2026-10-18 01:03:35,452] ERROR django.request Internal Server Error: /api/v1/${path}`,
    'Traceback (most recent call last):',
    '  File "…/django/db/backends/utils.py", line 105, in _execute',
    'sqlite3.OperationalError: database is locked',
    '',
    'django.db.utils.OperationalError: database is locked',
    `[2026-10-18 01:03:35,456] ERROR django.server "POST /api/v1/${path} HTTP/1.1" 500 79398`,
    '',
  ].join('\n')

const NON_JSON = JSON.stringify({
  msg: 'درخواست شما انجام نشد.',
  code: 500,
  data: { type: 'server_error', errors: [{ code: 'non_json_response', detail: '…', attr: null }] },
})

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

const line = (variant: number, quantity: number) => ({ variant_id: variant, quantity })
const cart = (lines: { variant_id: number; quantity: number }[]) => ({
  lines,
  coupon: { code: null },
  shipping: { code: null, is_selected: false, cash_on_delivery: false },
  destination: null,
})

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

describe('lockLogged', () => {
  it('finds the lock in the error record of this API path', () => {
    expect(lockLogged(lockRecord('cart/item/add/'), 'cart/item/add/')).toBe(true)
  })

  it('ignores another path’s lock, and another error of this path', () => {
    expect(lockLogged(lockRecord('cart/clear/'), 'cart/item/add/')).toBe(false)
    const other = lockRecord('cart/item/add/').replaceAll('database is locked', 'no such table')
    expect(lockLogged(other, 'cart/item/add/')).toBe(false)
    expect(lockLogged('', 'cart/item/add/')).toBe(false)
  })
})

describe('cartState', () => {
  it('keeps what a write changes: lines, coupon, shipping choice, destination', () => {
    const before = cart([line(2, 1), line(1, 2)])
    expect(cartState(before)).toBe(cartState(cart([line(1, 2), line(2, 1)])))
    expect(cartState(before)).not.toBe(cartState(cart([line(1, 2)])))
    expect(cartState({ ...before, coupon: { code: 'TEA30' } })).not.toBe(cartState(before))
    expect(cartState({ ...before, destination: { city_id: 301 } })).not.toBe(cartState(before))
  })
})

describe('cartWrite', () => {
  it('returns the answer of a write that went through, after one action', async () => {
    const { page, act } = fakePage([{ status: 200, body: '{}' }], [cart([])])
    const answer = await cartWrite(page, ADD, act, { log: noLog })
    expect(answer.status()).toBe(200)
    expect(act).toHaveBeenCalledTimes(1)
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
