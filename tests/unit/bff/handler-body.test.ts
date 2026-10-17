// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { jwtExpiringIn } from '../support/jwt'
import {
  bff,
  envelope,
  failure,
  loadHandler,
  refreshCalls,
  stubEnv,
  upstreamCalls,
  type FetchSpy,
} from './support'

const MAX_JSON = 2_621_440
const MAX_MULTIPART = 6 * 1024 * 1024

let fetchSpy: FetchSpy

beforeEach(() => {
  stubEnv()
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => envelope({ ok: true }))
})

afterEach(() => {
  fetchSpy.mockRestore()
  vi.unstubAllEnvs()
  vi.resetModules()
  vi.doUnmock('server-only')
})

describe('streamed uploads', () => {
  // The refresh after it, and the retryable 503 when it works: handler-refresh-transient.test.ts.
  it('never sends a streamed upload twice after a 401 (the refresh before the call covers expiry)', async () => {
    fetchSpy.mockImplementation(async () => failure(401, 'token_not_valid'))
    const form = new FormData()
    form.append('receipt', new Blob(['x']), 'r.jpg')
    const handleBff = await loadHandler()
    const res = await handleBff(
      ...bff('payment/card-to-card/receipt/', {
        method: 'POST',
        body: form,
        cookies: { ff_at: jwtExpiringIn(600), ff_rt: jwtExpiringIn(9999) },
      }),
    )
    // The refresh token is refused too: the 401 stands.
    expect(res.status).toBe(401)
    expect(upstreamCalls(fetchSpy)).toHaveLength(1)
    expect(refreshCalls(fetchSpy)).toHaveLength(1)
  })
})

describe('multipart Content-Length', () => {
  it('forwards the client Content-Length with the streamed body', async () => {
    const form = new FormData()
    form.append('avatar_picture', new Blob(['PNGDATA']), 'a.png')
    const sized = new Request('http://x.test/', { method: 'POST', body: form })
    const bytes = new Uint8Array(await sized.arrayBuffer())
    const contentType = sized.headers.get('content-type') ?? ''
    const handleBff = await loadHandler()
    await handleBff(
      ...bff('account/profile/me/', {
        method: 'PATCH',
        body: bytes,
        headers: { 'content-type': contentType, 'content-length': String(bytes.byteLength) },
      }),
    )
    const [call] = upstreamCalls(fetchSpy)
    expect(call?.headers.get('Content-Length')).toBe(String(bytes.byteLength))
    expect(call?.headers.get('Content-Type')).toBe(contentType)
  })
})

describe('body size caps', () => {
  const TOO_LARGE = 'حجم درخواست ارسالی بیش از حد مجاز است.'

  async function expectTooLarge(res: Response) {
    expect(res.status).toBe(413)
    const body = await res.json()
    expect(body.data.errors[0]).toEqual({
      code: 'request_too_large',
      detail: TOO_LARGE,
      attr: null,
    })
    expect(res.headers.get('cache-control')).toBe('no-store')
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

  it('answers 413 before reading a JSON body whose Content-Length exceeds 2.5 MiB', async () => {
    const handleBff = await loadHandler()
    const res = await handleBff(
      ...bff('contact-us/message/submit/', {
        method: 'POST',
        body: '{}',
        headers: { 'content-type': 'application/json', 'content-length': String(MAX_JSON + 1) },
      }),
    )
    await expectTooLarge(res)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('stops reading a JSON body at 2.5 MiB when no Content-Length is declared', async () => {
    const handleBff = await loadHandler()
    const res = await handleBff(
      ...bff('contact-us/message/submit/', {
        method: 'POST',
        body: stream(MAX_JSON + 1),
        headers: { 'content-type': 'application/json' },
      }),
    )
    await expectTooLarge(res)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('accepts a JSON body of exactly 2.5 MiB', async () => {
    const handleBff = await loadHandler()
    const res = await handleBff(
      ...bff('contact-us/message/submit/', {
        method: 'POST',
        body: stream(MAX_JSON),
        headers: { 'content-type': 'application/json' },
      }),
    )
    expect(res.status).toBe(200)
    expect(String(upstreamCalls(fetchSpy)[0]?.init.body)).toHaveLength(MAX_JSON)
  })

  it('answers 413 before streaming a multipart body whose Content-Length exceeds 6 MiB', async () => {
    const handleBff = await loadHandler()
    const res = await handleBff(
      ...bff('payment/card-to-card/receipt/', {
        method: 'POST',
        body: stream(16),
        headers: {
          'content-type': 'multipart/form-data; boundary=b',
          'content-length': String(MAX_MULTIPART + 1),
        },
      }),
    )
    await expectTooLarge(res)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('cuts a multipart stream off at 6 MiB when no Content-Length is declared', async () => {
    fetchSpy.mockImplementation(async (_input, init) => {
      await new Response(init?.body).arrayBuffer()
      return envelope({})
    })
    const handleBff = await loadHandler()
    const res = await handleBff(
      ...bff('payment/card-to-card/receipt/', {
        method: 'POST',
        body: stream(MAX_MULTIPART + 1),
        headers: { 'content-type': 'multipart/form-data; boundary=b' },
      }),
    )
    await expectTooLarge(res)
  })
})
