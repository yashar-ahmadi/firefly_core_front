import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cartAnswer,
  cartWrite,
  requestCartWrite,
  type BackendLog,
  type CartWriteSpec,
} from '../../e2e/support/cart-write'
import { cart, line, lockRecord, NON_JSON } from './cart-write-support'

// The cart-write guard for a test's own writes (`requestCartWrite`: a measure's setup through the
// BFF) and for a write the page makes by itself (`answer`: a waiter set before the action that
// leads to it). Only the dev database's lock is repeated, once, with a warning; anything else
// fails (Task 2 fix round 1: `seedCart` no longer retries any 500 silently).

const ADD: CartWriteSpec = { method: 'POST', path: 'cart/item/add/', label: 'seed' }
const noLog: BackendLog = { size: async () => 0, since: async () => '' }
const locked: BackendLog = { size: async () => 100, since: async () => lockRecord(ADD.path) }

const answer = (status: number, body = '{}') => ({
  url: () => `http://localhost:3000/api/bff/${ADD.path}`,
  status: () => status,
  ok: () => status >= 200 && status < 300,
  text: async () => body,
})

/** The context's requests: cart reads answer from `carts` (the last one repeats). */
function fakeRequest(carts: unknown[]) {
  const reads = [...carts]
  return {
    get: vi.fn(async () => {
      const data = reads.length > 1 ? reads.shift() : reads[0]
      return { ok: () => true, status: () => 200, json: async () => ({ data }) }
    }),
  }
}
type Request = Parameters<typeof requestCartWrite>[0]
type Send = Parameters<typeof requestCartWrite>[2]
/** A `send` answering `statuses` in turn. */
const sender = (...answers: ReturnType<typeof answer>[]) =>
  vi.fn(async () => answers.shift()!) as unknown as Send & ReturnType<typeof vi.fn>

afterEach(() => vi.restoreAllMocks())

describe('requestCartWrite', () => {
  it('returns the answer of a write that went through, sent once', async () => {
    const send = sender(answer(200))
    const request = fakeRequest([cart([])]) as unknown as Request
    expect((await requestCartWrite(request, ADD, send, { log: noLog })).status()).toBe(200)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('the dev database’s lock: the cart unchanged, a warning, sent once more', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const send = sender(answer(500, NON_JSON), answer(200))
    const request = fakeRequest([cart([line(1, 1)])])
    const done = await requestCartWrite(request as unknown as Request, ADD, send, { log: locked })
    expect(done.status()).toBe(200)
    expect(send).toHaveBeenCalledTimes(2)
    expect(request.get).toHaveBeenCalledTimes(2)
    expect(String(warn.mock.calls[0])).toMatch(/seed.*500.*database was locked/s)
  })

  it('any other 500 fails at once, saying what the BFF answered (no silent retry)', async () => {
    const send = sender(answer(500, NON_JSON), answer(200))
    const request = fakeRequest([cart([])]) as unknown as Request
    await expect(requestCartWrite(request, ADD, send, { log: noLog })).rejects.toThrow(
      /seed.*500.*non_json_response/s,
    )
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('a lock that left the cart changed, or a second failure, fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const changed = fakeRequest([cart([]), cart([line(1, 1)])]) as unknown as Request
    await expect(
      requestCartWrite(changed, ADD, sender(answer(500, NON_JSON)), { log: locked }),
    ).rejects.toThrow(/changed/)
    const twice = sender(answer(500, NON_JSON), answer(500, NON_JSON))
    const request = fakeRequest([cart([])]) as unknown as Request
    await expect(requestCartWrite(request, ADD, twice, { log: locked })).rejects.toThrow(/again/)
  })
})

describe('a write the page makes by itself', () => {
  type WritePage = Parameters<typeof cartWrite>[0]
  const fakePage = (later: () => Promise<unknown>) => ({
    waitForResponse: vi.fn(later),
    request: fakeRequest([cart([])]),
  })

  it('`cartAnswer` sets its waiter at once; one never heard does not reject unhandled', async () => {
    const page = fakePage(() => Promise.reject(new Error('page closed')))
    void cartAnswer(page as unknown as WritePage, ADD)
    expect(page.waitForResponse).toHaveBeenCalledTimes(1)
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  it('`answer`: awaited after `act` as the first try; a lock repeats through `retry`', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const page = fakePage(async () => answer(200))
    const act = vi.fn(async () => {})
    const retry = vi.fn(async () => {})
    const first = Promise.resolve(answer(500, NON_JSON)) as unknown as Promise<never>
    const done = await cartWrite(page as unknown as WritePage, ADD, act, {
      answer: first,
      retry,
      log: locked,
    })
    expect(done.status()).toBe(200)
    expect([act.mock.calls.length, retry.mock.calls.length]).toEqual([1, 1])
    // The first try was the waiter given: only the repeat set one.
    expect(page.waitForResponse).toHaveBeenCalledTimes(1)
  })
})
