// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The blog's server loaders (blog digest §1.3–1.6, §1.11): anonymous reads (never a token),
// cached like their catalog twins (the home and the post list 60 s, the categories 300 s), the
// visitor's IP only on a search; a missing or draft category is null; the blog's switch turned
// off (`503 feature_disabled`, `blog`) is a BlogUnavailableError carrying the operator's text.

const apiFetch = vi.fn()

async function load() {
  vi.resetModules()
  vi.doMock('server-only', () => ({}))
  vi.doMock('@/lib/api/server', () => ({ apiFetch }))
  vi.doMock('next/headers', () => ({
    headers: async () => new Headers({ 'x-real-ip': '203.0.113.9' }),
  }))
  const [api, errors, blogErrors] = await Promise.all([
    import('@/features/blog/api'),
    import('@/lib/api/errors'),
    import('@/features/blog/blog-errors'),
  ])
  return { ...api, ...errors, ...blogErrors }
}

type Loaded = Awaited<ReturnType<typeof load>>

const page = <T>(results: T[], next: string | null = null) => ({
  data: { count: results.length, total_pages: 1, current_page: 1, page_size: 12, next, results },
})

function disabled(loaded: Loaded, feature: string, detail: string) {
  return loaded.ApiError.fromBody(503, {
    msg: 'این سرویس موقتاً در دسترس نیست.',
    data: {
      type: 'server_error',
      errors: [{ code: 'feature_disabled', detail, attr: null }],
      feature,
      feature_name: 'وبلاگ',
    },
  })
}

beforeEach(() => {
  vi.stubEnv('FIREFLY_API_URL', 'https://api.test')
  vi.stubEnv('SITE_URL', 'https://shop.test')
  vi.stubEnv('CLIENT_IP_HEADER', 'x-real-ip')
  apiFetch.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
  for (const name of ['server-only', '@/lib/api/server', 'next/headers']) vi.doUnmock(name)
})

describe('getBlogCategory', () => {
  it('reads the detail by slug, cached 300 s under its own tag', async () => {
    const loaded = await load()
    apiFetch.mockResolvedValue({
      data: { id: 1, slug: 'mobile-blog', path: 'tech-news/mobile-blog' },
    })
    expect(await loaded.getBlogCategory('mobile-blog')).toMatchObject({ slug: 'mobile-blog' })
    expect(apiFetch).toHaveBeenCalledWith('blog/category/mobile-blog', {
      revalidate: 300,
      tags: ['blog-category:mobile-blog', 'blog'],
    })
  })

  it('returns null on the API’s 404, remembered: the same slug asks nothing for a minute', async () => {
    const loaded = await load()
    apiFetch.mockRejectedValue(new loaded.ApiError({ status: 404, code: 'not_found' }))
    expect(await loaded.getBlogCategory('no-such-category')).toBeNull()
    expect(await loaded.getBlogCategory('no-such-category')).toBeNull()
    expect(apiFetch).toHaveBeenCalledTimes(1)
  })

  it('a Persian slug is sent encoded once; `list` and a slug with a slash are null, unasked', async () => {
    const loaded = await load()
    apiFetch.mockResolvedValue({ data: { id: 2, slug: 'گوشی' } })
    await loaded.getBlogCategory('%DA%AF%D9%88%D8%B4%DB%8C')
    expect(apiFetch.mock.calls[0]?.[0]).toBe('blog/category/%DA%AF%D9%88%D8%B4%DB%8C')
    expect(apiFetch.mock.calls[0]?.[1].tags[0]).toBe('blog-category:گوشی')
    apiFetch.mockClear()
    expect(await loaded.getBlogCategory('list')).toBeNull()
    expect(await loaded.getBlogCategory('a%2Fb')).toBeNull()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('throws other failures (an outage is no missing category)', async () => {
    const loaded = await load()
    apiFetch.mockRejectedValue(loaded.ApiError.nonJson(404))
    await expect(loaded.getBlogCategory('mobile-blog')).rejects.toMatchObject({
      code: 'non_json_response',
    })
  })
})

describe('the blog switch turned off (503 feature_disabled)', () => {
  it.each([
    ['getBlogHome', (l: Loaded) => l.getBlogHome()],
    ['getBlogPosts', (l: Loaded) => l.getBlogPosts({ page: 2 })],
    ['getBlogCategory', (l: Loaded) => l.getBlogCategory('tutorial')],
  ])('%s throws a BlogUnavailableError with the operator’s text', async (_, call) => {
    const loaded = await load()
    apiFetch.mockRejectedValue(disabled(loaded, 'blog', 'وبلاگ تا فردا بسته است.'))
    const error = await call(loaded).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(loaded.BlogUnavailableError)
    expect((error as InstanceType<Loaded['BlogUnavailableError']>).reason).toBe(
      'وبلاگ تا فردا بسته است.',
    )
  })

  it('getBlogCategories throws it too, though it swallows every other failure', async () => {
    const loaded = await load()
    apiFetch.mockRejectedValue(disabled(loaded, 'blog', 'بسته'))
    await expect(loaded.getBlogCategories()).rejects.toBeInstanceOf(loaded.BlogUnavailableError)
  })

  it('another switch (blog_comments) is no blog outage: the ApiError as it came', async () => {
    const loaded = await load()
    const refusal = disabled(loaded, 'blog_comments', 'ثبت نظر غیرفعال است')
    apiFetch.mockRejectedValue(refusal)
    await expect(loaded.getBlogHome()).rejects.toBe(refusal)
  })
})

describe('getBlogHome and getBlogPosts', () => {
  it('the home: anonymous, 60 s', async () => {
    const loaded = await load()
    apiFetch.mockResolvedValue({
      data: { featured_posts: [], recent_posts: [], recent_products: [] },
    })
    await loaded.getBlogHome()
    expect(apiFetch).toHaveBeenCalledExactlyOnceWith('blog/home', {
      revalidate: 60,
      tags: ['blog:home', 'blog'],
    })
  })

  it('the post list: 60 s, the query in one order, page 1 left out, no visitor IP', async () => {
    const loaded = await load()
    apiFetch.mockResolvedValue(page([]))
    await loaded.getBlogPosts({ page: 1, category: 'tutorial' })
    await loaded.getBlogPosts({ category: 'tutorial', page: 3 })
    expect(apiFetch.mock.calls).toEqual([
      [
        'blog/post/list',
        { query: { category: 'tutorial' }, revalidate: 60, tags: ['blog'], forwardedFor: null },
      ],
      [
        'blog/post/list',
        {
          query: { category: 'tutorial', page: '3' },
          revalidate: 60,
          tags: ['blog'],
          forwardedFor: null,
        },
      ],
    ])
  })

  it('a search is the visitor’s own read: their IP goes with it (their cache entry, their rate)', async () => {
    const loaded = await load()
    apiFetch.mockResolvedValue(page([]))
    await loaded.getBlogPosts({ search: 'گوشی' })
    expect(apiFetch.mock.calls[0]?.[1]).toMatchObject({
      query: { search: 'گوشی' },
      forwardedFor: '203.0.113.9',
    })
  })

  it('never sends a token', async () => {
    const loaded = await load()
    apiFetch.mockResolvedValue(page([]))
    await loaded.getBlogPosts({})
    await loaded.getBlogHome()
    for (const [, options] of apiFetch.mock.calls) expect(options).not.toHaveProperty('token')
  })
})

describe('getBlogCategories', () => {
  it('reads every page, 100 at a time, cached 300 s', async () => {
    const loaded = await load()
    apiFetch
      .mockResolvedValueOnce(
        page([{ id: 1 }], 'https://api.test/api/v1/blog/category/list/?page=2'),
      )
      .mockResolvedValueOnce(page([{ id: 2 }]))
    expect((await loaded.getBlogCategories()).map((c) => c.id)).toEqual([1, 2])
    expect(apiFetch.mock.calls.map(([, options]) => options)).toEqual([
      { query: { limit: 100, page: 1 }, revalidate: 300, tags: ['blog'] },
      { query: { limit: 100, page: 2 }, revalidate: 300, tags: ['blog'] },
    ])
  })

  it('any other failure is an empty list, logged once without a URL', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const loaded = await load()
    apiFetch.mockRejectedValue(new loaded.ApiError({ status: 502, code: 'http_502' }))
    expect(await loaded.getBlogCategories()).toEqual([])
    expect(error).toHaveBeenCalledExactlyOnceWith(
      '[blog] getBlogCategories failed:',
      502,
      'http_502',
    )
    error.mockRestore()
  })
})
