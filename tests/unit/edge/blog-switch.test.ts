// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The proxy's view of the blog switch: one API read a minute per process, the first awaited,
// later ones in the background; a failed read keeps what was known; a page's refused read turns
// it off at once, for every bundle of the process (globalThis).

const apiFetch = vi.fn()
/** The state's key (`BLOG_SWITCH_STATE`; the module itself is server-only). */
const BLOG_SWITCH_STATE = Symbol.for('firefly.blog-switch')

async function load() {
  vi.resetModules()
  vi.doMock('server-only', () => ({}))
  vi.doMock('@/lib/api/server', () => ({ apiFetch }))
  return import('@/lib/edge/blog-switch')
}

/** ApiError of the module graph `load()` gave (resetModules makes a new class each time). */
async function apiError(status: number, code: string) {
  const { ApiError } = await import('@/lib/api/errors')
  return new ApiError({ status, code })
}

const row = (is_enabled: boolean, disable_reason: string | null = null) => ({
  data: { feature_key: 'blog', display_name: 'وبلاگ', is_enabled, disable_reason },
})

beforeEach(() => {
  delete (globalThis as Record<symbol, unknown>)[BLOG_SWITCH_STATE]
  vi.useFakeTimers({ now: new Date('2026-10-19T09:00:00Z'), toFake: ['Date'] })
  apiFetch.mockReset()
  apiFetch.mockResolvedValue(row(true))
})

afterEach(() => {
  vi.useRealTimers()
  vi.doUnmock('server-only')
  vi.doUnmock('@/lib/api/server')
})

describe('blogSwitchOff', () => {
  it('reads global/feature-status/blog/ once, awaited the first time: on is null', async () => {
    const { blogSwitchOff } = await load()
    expect(await blogSwitchOff()).toBeNull()
    expect(apiFetch).toHaveBeenCalledExactlyOnceWith('global/feature-status/blog', {
      timeoutMs: 1_500,
    })
    expect(await blogSwitchOff()).toBeNull()
    expect(apiFetch).toHaveBeenCalledTimes(1)
  })

  it('off: the operator’s reason, or null without one', async () => {
    apiFetch.mockResolvedValue(row(false, '  به‌روزرسانی محتوا تا فردا  '))
    const { blogSwitchOff } = await load()
    expect(await blogSwitchOff()).toEqual({ reason: 'به‌روزرسانی محتوا تا فردا' })
    delete (globalThis as Record<symbol, unknown>)[BLOG_SWITCH_STATE]
    apiFetch.mockResolvedValue(row(false, ' '))
    expect(await blogSwitchOff()).toEqual({ reason: null })
  })

  it('reads again after a minute, in the background: the old answer until the new one', async () => {
    const { blogSwitchOff } = await load()
    await blogSwitchOff()
    vi.setSystemTime(Date.now() + 59_000)
    await blogSwitchOff()
    expect(apiFetch).toHaveBeenCalledTimes(1)

    let answer: (value: unknown) => void = () => {}
    apiFetch.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    vi.setSystemTime(Date.now() + 2_000)
    expect(await blogSwitchOff()).toBeNull()
    expect(apiFetch).toHaveBeenCalledTimes(2)
    // One read at a time.
    expect(await blogSwitchOff()).toBeNull()
    expect(apiFetch).toHaveBeenCalledTimes(2)
    answer(row(false, 'تعمیرات'))
    await vi.waitFor(async () => expect(await blogSwitchOff()).toEqual({ reason: 'تعمیرات' }))
  })

  it('a failed read keeps what was known (on, at first), logs no URL, and is retried after 15 s', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { blogSwitchOff } = await load()
    apiFetch.mockRejectedValue(await apiError(0, 'network_error'))
    expect(await blogSwitchOff()).toBeNull()
    expect(error).toHaveBeenCalledExactlyOnceWith(
      '[blog-switch] could not read the blog switch:',
      '0 network_error',
    )
    vi.setSystemTime(Date.now() + 14_000)
    await blogSwitchOff()
    expect(apiFetch).toHaveBeenCalledTimes(1)
    apiFetch.mockResolvedValue(row(false))
    vi.setSystemTime(Date.now() + 2_000)
    await blogSwitchOff()
    await vi.waitFor(async () => expect(await blogSwitchOff()).toEqual({ reason: null }))
    error.mockRestore()
  })

  it('an unknown key (404) is a switch that does not exist: on', async () => {
    const { blogSwitchOff } = await load()
    apiFetch.mockRejectedValue(await apiError(404, 'not_found'))
    expect(await blogSwitchOff()).toBeNull()
  })
})

describe('noteBlogOff', () => {
  it('turns it off at once, for a minute, without a read; then the API is asked again', async () => {
    const { blogSwitchOff, noteBlogOff } = await load()
    noteBlogOff({ reason: 'وبلاگ بسته است' })
    expect(await blogSwitchOff()).toEqual({ reason: 'وبلاگ بسته است' })
    expect(apiFetch).not.toHaveBeenCalled()
    vi.setSystemTime(Date.now() + 61_000)
    await blogSwitchOff()
    expect(apiFetch).toHaveBeenCalledTimes(1)
    await vi.waitFor(async () => expect(await blogSwitchOff()).toBeNull())
  })

  it('is seen by another copy of the module (the proxy’s and the pages’ bundles)', async () => {
    const pages = await load()
    const proxy = await load()
    expect(proxy).not.toBe(pages)
    pages.noteBlogOff({ reason: null })
    expect(await proxy.blogSwitchOff()).toEqual({ reason: null })
    expect(apiFetch).not.toHaveBeenCalled()
  })
})
