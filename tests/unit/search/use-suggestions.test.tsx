import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSuggestions } from '@/features/search/use-suggestions'
import { ApiError } from '@/lib/api/errors'
import { deferred } from '../cart/support'
import { clientProviders } from '../support/providers'
import { answer, SAMSUNG, suggestions } from './fixtures'

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))

/** The hook under a fresh QueryClient, typed into with `type(q)`. */
function setup() {
  const { wrapper } = clientProviders()
  const hook = renderHook(({ q }) => useSuggestions(q), { initialProps: { q: '' }, wrapper })
  const type = (q: string) => hook.rerender({ q })
  return { ...hook, type }
}

async function wait(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

/** The `q` of every suggest request made so far. */
function requested(): string[] {
  return mocks.bffFetch.mock.calls.map(([, options]) => options.query.q)
}

function signalOf(call: number): AbortSignal {
  return mocks.bffFetch.mock.calls[call]![1].signal
}

beforeEach(() => {
  vi.useFakeTimers()
  mocks.bffFetch.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useSuggestions', () => {
  it('sends nothing for one character', async () => {
    const { result, type } = setup()
    type('گ')
    await wait(1000)
    expect(mocks.bffFetch).not.toHaveBeenCalled()
    expect(result.current).toEqual({ data: null, isLoading: false })
  })

  it('counts the characters once normalised: kashida, ZWNJ and a lone digit stay under two', async () => {
    const { type } = setup()
    for (const q of ['ـگ', 'گ\u{200C}', ' ۲ ', '\u{202B}س\u{202C}']) {
      type(q)
      await wait(300)
    }
    expect(mocks.bffFetch).not.toHaveBeenCalled()
  })

  it('waits for a 250 ms pause: fast typing sends one request, for the last term', async () => {
    mocks.bffFetch.mockResolvedValue(answer(suggestions('گوشی', ['گوشی موبایل ساده'])))
    const { result, type } = setup()
    type('گوش')
    await wait(100)
    type('گوشی')
    expect(result.current.isLoading).toBe(true)
    await wait(249)
    expect(mocks.bffFetch).not.toHaveBeenCalled()
    await wait(1)
    expect(mocks.bffFetch).toHaveBeenCalledTimes(1)
    expect(mocks.bffFetch).toHaveBeenCalledWith('search/suggest/', {
      query: { q: 'گوشی' },
      signal: expect.any(AbortSignal),
    })
    expect(result.current.data?.products[0]?.name).toBe('گوشی موبایل ساده')
    expect(result.current.isLoading).toBe(false)
  })

  it('aborts the request on its way at the next keystroke, and ignores its late answer', async () => {
    const first = deferred<unknown>()
    const second = deferred<unknown>()
    mocks.bffFetch.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { result, type } = setup()
    type('سام')
    await wait(250)
    expect(signalOf(0).aborted).toBe(false)

    type('سامسونگ')
    expect(signalOf(0).aborted).toBe(true)
    await wait(250)
    expect(requested()).toEqual(['سام', 'سامسونگ'])

    await act(async () => second.resolve(answer(SAMSUNG)))
    expect(result.current.data).toEqual(SAMSUNG)
    // The older term answers last: nothing changes.
    await act(async () => first.resolve(answer(suggestions('سام', ['سامان']))))
    expect(result.current.data).toEqual(SAMSUNG)
  })

  it('never shows an answer for a term the input has already left', async () => {
    const first = deferred<unknown>()
    mocks.bffFetch.mockReturnValueOnce(first.promise)
    const { result, type } = setup()
    type('سام')
    await wait(250)
    type('سامس')
    await act(async () => first.resolve(answer(suggestions('سام', ['سامان']))))
    expect(result.current.data).toBeNull()
    expect(result.current.isLoading).toBe(true)
  })

  it('turns a failed request into no suggestions, without throwing', async () => {
    mocks.bffFetch.mockRejectedValue(new ApiError({ status: 503, code: 'http_503' }))
    const { result, type } = setup()
    type('گوشی')
    await wait(250)
    expect(result.current).toEqual({ data: null, isLoading: false })
  })

  it('drops the last suggestions once the term is under two characters again', async () => {
    mocks.bffFetch.mockResolvedValue(answer(SAMSUNG))
    const { result, type } = setup()
    type('سامسونگ')
    await wait(250)
    expect(result.current.data).toEqual(SAMSUNG)
    type('س')
    expect(result.current).toEqual({ data: null, isLoading: false })
  })

  it('normalises Arabic letters, so «كي» and «کی» share one request and one cache entry', async () => {
    mocks.bffFetch.mockResolvedValue(answer(suggestions('کی', ['کیف پول'])))
    const { result, type } = setup()
    type('\u{0643}\u{064A}')
    await wait(250)
    expect(requested()).toEqual(['کی'])
    type('ک')
    await wait(250)
    type('کی')
    await wait(0)
    expect(result.current.data?.products[0]?.name).toBe('کیف پول')
    expect(mocks.bffFetch).toHaveBeenCalledTimes(1)
  })

  it('keeps an answer 60 seconds: the same term again within them sends nothing', async () => {
    mocks.bffFetch.mockResolvedValue(answer(SAMSUNG))
    const { type } = setup()
    type('سامسونگ')
    await wait(250)
    type('سامس')
    await wait(250)
    type('سامسونگ')
    await wait(250)
    expect(requested()).toEqual(['سامسونگ', 'سامس'])

    await wait(60_000)
    type('سامس')
    await wait(250)
    type('سامسونگ')
    await wait(250)
    expect(requested()).toEqual(['سامسونگ', 'سامس', 'سامس', 'سامسونگ'])
  })

  it('pauses after a 429 for as long as the API asks', async () => {
    mocks.bffFetch.mockRejectedValueOnce(
      new ApiError({ status: 429, code: 'throttled', retryAfter: 30 }),
    )
    mocks.bffFetch.mockResolvedValue(answer(SAMSUNG))
    const { result, type } = setup()
    type('سام')
    await wait(250)
    type('سامسونگ')
    await wait(250)
    expect(requested()).toEqual(['سام'])
    expect(result.current).toEqual({ data: null, isLoading: false })

    await wait(30_000)
    type('سامسونگ ')
    type('سامسونگ گ')
    await wait(250)
    expect(requested()).toEqual(['سام', 'سامسونگ گ'])
  })
})
