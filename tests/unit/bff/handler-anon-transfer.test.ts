// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { jwtExpiringIn } from '../support/jwt'
import {
  API,
  bff,
  envelope,
  failure,
  loadHandler,
  refreshCalls,
  stubEnv,
  upstreamCalls,
  type FetchSpy,
} from './support'

// The card transfer of someone else's order without the session (order digest §3.2.7–3.2.8,
// §11 #7): signed in, the API refuses another account's payment (403 `payment_forbidden`) and
// answers the same calls made anonymously, so the card-transfer page retries its cards read
// (`GET payment/<uuid>/card-transfer/`) and its receipt (`POST …/card-transfer/receipt/`,
// multipart) with `?anon=1`. Exactly those two (and the status, handler-anon.test.ts): no bearer,
// no cart token, no refresh, no cookie set or cleared, the flag kept from the API; the receipt
// still streamed under the 6 MiB cap.

const UUID = '0b6f5a9e-3c1d-4f7a-9e2b-1a2b3c4d5e6f'
const CARDS = `payment/${UUID}/card-transfer/`
const RECEIPT = `payment/${UUID}/card-transfer/receipt/`
const MAX_MULTIPART = 6 * 1024 * 1024

let fetchSpy: FetchSpy

beforeEach(() => {
  stubEnv()
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => envelope({ ok: 1 }))
})

afterEach(() => {
  fetchSpy.mockRestore()
  vi.unstubAllEnvs()
  vi.resetModules()
  vi.doUnmock('server-only')
})

const session = (access = jwtExpiringIn(900)) => ({
  ff_at: access,
  ff_rt: jwtExpiringIn(86_400),
  ff_auth: 'k3J9f0qLx2mN8pR1sT4u',
  ff_cart: 'guest-cart-token',
})

async function multipart(): Promise<{ bytes: Uint8Array<ArrayBuffer>; type: string }> {
  const form = new FormData()
  form.append('image', new Blob(['PNGDATA']), 'receipt.png')
  form.append('payer_card_last_digits', '1234')
  const sized = new Request('http://x.test/', { method: 'POST', body: form })
  return {
    bytes: new Uint8Array(await sized.arrayBuffer()),
    type: sized.headers.get('content-type') ?? '',
  }
}

function stream(totalBytes: number, chunk = 64 * 1024): ReadableStream<Uint8Array> {
  let sent = 0
  return new ReadableStream({
    pull(controller) {
      if (sent >= totalBytes) return controller.close()
      const size = Math.min(chunk, totalBytes - sent)
      sent += size
      controller.enqueue(new Uint8Array(size).fill(0x61))
    },
  })
}

describe('anon=1 on the card transfer’s cards', () => {
  it('reads them without the session: no bearer, no cart token, the flag kept from the API', async () => {
    const handleBff = await loadHandler()
    const res = await handleBff(...bff(`${CARDS}?anon=1`, { cookies: session() }))
    expect(res.status).toBe(200)
    const [call] = upstreamCalls(fetchSpy)
    expect(call?.url).toBe(`${API}${CARDS}`)
    expect(call?.headers.has('Authorization')).toBe(false)
    expect(call?.headers.has('X-Cart-Token')).toBe(false)
    expect(call?.headers.get('X-API-Key')).toBe('key-123')
    expect(call?.headers.get('X-Forwarded-For')).toBe('203.0.113.9')
    expect(res.headers.getSetCookie()).toEqual([])
  })

  it('never refreshes an expiring session, nor touches its cookies on a 401', async () => {
    fetchSpy.mockImplementation(async () => failure(401, 'token_not_valid'))
    const handleBff = await loadHandler()
    const res = await handleBff(...bff(`${CARDS}?anon=1`, { cookies: session(jwtExpiringIn(5)) }))
    expect(res.status).toBe(401)
    expect(refreshCalls(fetchSpy)).toHaveLength(0)
    expect(upstreamCalls(fetchSpy)).toHaveLength(1)
    expect(res.headers.getSetCookie()).toEqual([])
  })
})

describe('anon=1 on the receipt', () => {
  it('streams the multipart body without the session, its size and type as they came', async () => {
    const { bytes, type } = await multipart()
    const handleBff = await loadHandler()
    const res = await handleBff(
      ...bff(`${RECEIPT}?anon=1`, {
        method: 'POST',
        body: bytes,
        cookies: session(),
        headers: {
          origin: 'https://shop.test',
          'content-type': type,
          'content-length': String(bytes.byteLength),
        },
      }),
    )
    expect(res.status).toBe(200)
    const [call] = upstreamCalls(fetchSpy)
    expect(call?.url).toBe(`${API}${RECEIPT}`)
    expect(call?.init.method).toBe('POST')
    expect(call?.headers.has('Authorization')).toBe(false)
    expect(call?.headers.has('X-Cart-Token')).toBe(false)
    expect(call?.headers.get('Content-Type')).toBe(type)
    expect(call?.headers.get('Content-Length')).toBe(String(bytes.byteLength))
    expect(res.headers.getSetCookie()).toEqual([])
  })

  it('a 401 with an expiring session: no refresh, no upload_retry, no cookie cleared', async () => {
    fetchSpy.mockImplementation(async () => failure(401, 'token_not_valid'))
    const { bytes, type } = await multipart()
    const handleBff = await loadHandler()
    const res = await handleBff(
      ...bff(`${RECEIPT}?anon=1`, {
        method: 'POST',
        body: bytes,
        cookies: session(jwtExpiringIn(5)),
        headers: { origin: 'https://shop.test', 'content-type': type },
      }),
    )
    expect(res.status).toBe(401)
    expect(refreshCalls(fetchSpy)).toHaveLength(0)
    expect(upstreamCalls(fetchSpy)).toHaveLength(1)
    expect(res.headers.getSetCookie()).toEqual([])
  })

  it('keeps the 6 MiB cap: a stream past it is cut off with a 413', async () => {
    fetchSpy.mockImplementation(async (_input, init) => {
      await new Response(init?.body).arrayBuffer()
      return envelope({})
    })
    const handleBff = await loadHandler()
    const res = await handleBff(
      ...bff(`${RECEIPT}?anon=1`, {
        method: 'POST',
        body: stream(MAX_MULTIPART + 1),
        cookies: session(),
        headers: { origin: 'https://shop.test', 'content-type': 'multipart/form-data; boundary=b' },
      }),
    )
    expect(res.status).toBe(413)
    expect(res.headers.getSetCookie()).toEqual([])
  })
})

describe('anon=1 on the other card-transfer calls means nothing', () => {
  it.each<[string, string, string]>([
    ['the cards, written to', CARDS, 'POST'],
    ['the receipt, read', RECEIPT, 'GET'],
    ['the attempt’s cancel', `payment/${UUID}/cancel/`, 'POST'],
    ['the history detail', `payment/history/${UUID}/`, 'GET'],
    ['a cards path that is not a uuid', 'payment/not-a-uuid/card-transfer/', 'GET'],
    ['a receipt path that is not a uuid', 'payment/x/card-transfer/receipt/', 'POST'],
    ['a deeper path', `payment/${UUID}/card-transfer/receipt/x/`, 'POST'],
  ])('%s: the session goes, the flag is forwarded as it came', async (_, path, method) => {
    const access = jwtExpiringIn(900)
    const handleBff = await loadHandler()
    await handleBff(
      ...bff(`${path}?anon=1`, {
        method,
        cookies: session(access),
        headers: method === 'GET' ? {} : { origin: 'https://shop.test' },
        ...(method === 'GET' ? {} : { json: {} }),
      }),
    )
    const [call] = upstreamCalls(fetchSpy)
    expect(call?.url).toBe(`${API}${path}?anon=1`)
    expect(call?.headers.get('Authorization')).toBe(`Bearer ${access}`)
  })

  it('the receipt with another value of the flag goes with the session', async () => {
    const access = jwtExpiringIn(900)
    const { bytes, type } = await multipart()
    const handleBff = await loadHandler()
    await handleBff(
      ...bff(`${RECEIPT}?anon=true`, {
        method: 'POST',
        body: bytes,
        cookies: session(access),
        headers: { origin: 'https://shop.test', 'content-type': type },
      }),
    )
    expect(upstreamCalls(fetchSpy)[0]?.headers.get('Authorization')).toBe(`Bearer ${access}`)
  })
})
