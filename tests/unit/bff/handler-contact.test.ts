// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bff, envelope, stubEnv, upstreamCalls, type FetchSpy } from './support'

// The contact form's POST through the BFF (content digest §9.2, §0 item 10): the visitor's IP
// goes along as `X-Forwarded-For`, as on every uncached call, so each guest has the API's
// 10-an-hour quota to themselves rather than the whole shop sharing the server's; the body goes
// as typed (the honeypot included). When the API refuses the message for a stale subject list,
// the subjects' cache is expired, only after the CSRF check, at most once per 30 s.

const revalidateTag = vi.hoisted(() => vi.fn())
vi.mock('next/cache', () => ({ revalidateTag }))

const PATH = 'contact-us/message/submit/'
const BODY = {
  subject: 3,
  name: 'سارا',
  phone: '09121234567',
  message: 'پیام آزمایشی',
  website: '',
}

let fetchSpy: FetchSpy

async function load() {
  vi.resetModules()
  vi.doMock('server-only', () => ({}))
  return (await import('@/lib/bff/handler')).handleBff
}

function refused(code: string) {
  return envelope({ type: 'client_error', errors: [{ code, detail: 'جزئیات', attr: null }] }, 400)
}

beforeEach(() => {
  stubEnv()
  revalidateTag.mockReset()
  fetchSpy = vi.spyOn(globalThis, 'fetch')
})

afterEach(() => {
  fetchSpy.mockRestore()
  vi.unstubAllEnvs()
  vi.resetModules()
  vi.doUnmock('server-only')
})

const post = (init: Parameters<typeof bff>[1] = {}) =>
  bff(PATH, { method: 'POST', json: BODY, headers: { origin: 'https://shop.test' }, ...init })

describe('the contact form’s POST', () => {
  it('forwards the visitor’s IP and the body as typed, with the key', async () => {
    fetchSpy.mockResolvedValue(envelope({}, 201))
    const handleBff = await load()
    const res = await handleBff(...post())
    expect(res.status).toBe(201)
    const [call] = upstreamCalls(fetchSpy)
    expect(call?.url).toBe(`https://api.test/api/v1/${PATH}`)
    expect(call?.headers.get('X-Forwarded-For')).toBe('203.0.113.9')
    expect(call?.headers.get('X-API-Key')).toBe('key-123')
    expect(JSON.parse(String(call?.init.body))).toEqual(BODY)
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('keeps a filled honeypot (the API answers 201 and drops the message)', async () => {
    fetchSpy.mockResolvedValue(envelope({}, 201))
    const handleBff = await load()
    await handleBff(...post({ json: { ...BODY, website: 'http://spam.example' } }))
    const [call] = upstreamCalls(fetchSpy)
    expect(JSON.parse(String(call?.init.body))).toMatchObject({ website: 'http://spam.example' })
  })
})

describe('a stale subject list', () => {
  it.each(['contact_subject_unavailable', 'contact_subject_required'])(
    '%s: the subjects’ cache is expired at once, the refusal relayed',
    async (code) => {
      fetchSpy.mockResolvedValue(refused(code))
      const handleBff = await load()
      const res = await handleBff(...post())
      expect(res.status).toBe(400)
      expect(revalidateTag).toHaveBeenCalledExactlyOnceWith('contact-subjects', { expire: 0 })
    },
  )

  it('any other refusal leaves the cache alone', async () => {
    fetchSpy.mockResolvedValue(refused('contact_channel_required'))
    const handleBff = await load()
    await handleBff(...post())
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('a request from another site is refused before any call: no expiry', async () => {
    fetchSpy.mockResolvedValue(refused('contact_subject_unavailable'))
    const handleBff = await load()
    const res = await handleBff(...post({ headers: { origin: 'https://evil.example' } }))
    expect(res.status).toBe(403)
    expect(upstreamCalls(fetchSpy)).toEqual([])
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('without the BFF’s marker header: refused, no expiry', async () => {
    fetchSpy.mockResolvedValue(refused('contact_subject_unavailable'))
    const handleBff = await load()
    const res = await handleBff(...post({ csrf: false }))
    expect(res.status).toBe(403)
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('expires the cache at most once per 30 s, whatever the requests', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      fetchSpy.mockImplementation(async () => refused('contact_subject_unavailable'))
      const handleBff = await load()
      await handleBff(...post())
      await handleBff(...post())
      expect(revalidateTag).toHaveBeenCalledTimes(1)
      vi.setSystemTime(Date.now() + 30_000)
      await handleBff(...post())
      expect(revalidateTag).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('the same codes on another path change nothing', async () => {
    fetchSpy.mockResolvedValue(refused('contact_subject_unavailable'))
    const handleBff = await load()
    await handleBff(...bff('pages/terms/comment/submit/', { method: 'POST', json: {} }))
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})
