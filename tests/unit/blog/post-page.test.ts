import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BlogPostPage, { generateMetadata } from '@/app/(shop)/blog/[slug]/page'
import { ApiError } from '@/lib/api/errors'
import type { PostDetail } from '@/lib/api/types/blog-post'
import { stubBrowserApis } from '../support/dom-stubs'
import { makeJwt } from '../support/jwt'
import { paginated, renderTree, thrown } from './page-support'
import { postDetailFixture } from './post-fixtures'

// `/blog/<slug>/` reads its post once per page view (Review Focus #2): `GET blog/post/<slug>/`
// counts a view on every call (blog digest §1.5), so `generateMetadata` and the page share one
// React `cache()` call, and nothing caches it across requests (that would under-count views).

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  headers: new Headers(),
  cookies: new Map<string, string>(),
  noteBlogOff: vi.fn(),
  /** React's `cache()` memo, one per server request: cleared for each "request". */
  memo: new Map<unknown, Map<string, unknown>>(),
}))

// On the client build React's cache() memoises nothing; on the server it memoises per request.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  function cache<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
    return (...args) => {
      const entries = mocks.memo.get(fn) ?? new Map<string, unknown>()
      mocks.memo.set(fn, entries)
      const key = JSON.stringify(args)
      if (!entries.has(key)) entries.set(key, fn(...args))
      return entries.get(key) as R
    }
  }
  return { ...actual, cache, default: { ...actual, cache } }
})
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({
  headers: async () => mocks.headers,
  cookies: async () => ({
    get: (name: string) =>
      mocks.cookies.has(name) ? { name, value: mocks.cookies.get(name) } : undefined,
  }),
}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/blog/best-phones-under-30m/',
}))
vi.mock('@/lib/api/server', () => ({ apiFetch: mocks.apiFetch }))
vi.mock('@/lib/api/client', () => ({ bffFetch: vi.fn(() => new Promise(() => {})) }))
vi.mock('@/lib/edge/blog-switch', () => ({ noteBlogOff: mocks.noteBlogOff }))
vi.mock('@/features/settings/api', () => ({
  getTranslations: async () => ({}),
  getSiteSettings: async () => ({ name: 'فایرفلای' }),
}))
vi.mock('@/config/env', async () => {
  const { parseServerEnv } = await import('@/config/env-schema')
  const env = parseServerEnv({
    FIREFLY_API_URL: 'https://api.shop.ir',
    SITE_URL: 'https://shop.ir',
  })
  return { getServerEnv: () => env }
})
vi.mock('@/config/store-config', async () => {
  const pure = await import('@/config/resolve-store-config')
  const { parseServerEnv } = await import('@/config/env-schema')
  const env = { FIREFLY_API_URL: 'https://api.shop.ir', SITE_URL: 'https://shop.ir' }
  return { ...pure, getStoreConfig: () => pure.resolveStoreConfig(parseServerEnv(env)) }
})

stubBrowserApis()

const SLUG = 'best-phones-under-30m'
const POST_PATH = `blog/post/${SLUG}`
const TOKEN = makeJwt({ exp: 4_102_444_800 })
const props = (slug = SLUG) => ({ params: Promise.resolve({ slug }) })
const ok = (data: unknown) =>
  Promise.resolve({ data, msg: '', status: 200, headers: new Headers() })

let post: () => Promise<PostDetail> = async () => postDetailFixture()

beforeEach(() => {
  mocks.memo.clear()
  mocks.apiFetch.mockReset()
  mocks.noteBlogOff.mockReset()
  mocks.headers = new Headers({ 'x-real-ip': '5.6.7.8' })
  mocks.cookies = new Map([['ff_at', TOKEN]])
  post = async () => postDetailFixture()
  mocks.apiFetch.mockImplementation((path: string) => {
    if (path === POST_PATH) return post().then(ok)
    if (path.endsWith('/comment/list')) return ok(paginated([]))
    if (path === 'blog/category/list') return ok(paginated([]))
    return Promise.reject(new ApiError({ status: 404, code: 'not_found' }))
  })
})

/** One page view: the head, then the page, in the same request. */
async function view(slug = SLUG) {
  const meta = await generateMetadata(props(slug))
  await renderTree(await BlogPostPage(props(slug)))
  return meta
}

const postReads = () => mocks.apiFetch.mock.calls.filter(([path]) => path === POST_PATH)

describe('the post page reads its post once per page view', () => {
  it('generateMetadata and the page share one read (one counted view)', async () => {
    const meta = await view()
    expect(postReads()).toHaveLength(1)
    expect(meta.title).toEqual({ absolute: postDetailFixture().page_title })
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(postDetailFixture().name)
  })

  it('is read per request with the visitor’s session and IP, never from a cache', async () => {
    await view()
    mocks.memo.clear()
    await view()
    expect(postReads()).toHaveLength(2)
    const [, options] = postReads()[0]!
    expect(options).toEqual({ token: TOKEN, forwardedFor: '5.6.7.8' })
    expect(options).not.toHaveProperty('revalidate')
  })

  it('a guest’s read (or a malformed ff_at) carries no token', async () => {
    mocks.cookies = new Map([['ff_at', 'not-a-jwt']])
    await view()
    expect(postReads()[0]![1]).toEqual({ token: null, forwardedFor: '5.6.7.8' })
  })
})

describe('a post the visitor cannot see', () => {
  it('missing, a draft or not yet due (the API’s 404): a real 404 before anything renders', async () => {
    post = () =>
      Promise.reject(new ApiError({ status: 404, code: 'not_found', detail: 'یافت نشد.' }))
    const meta = await generateMetadata(props())
    expect(meta.title).toEqual({ absolute: 'صفحه پیدا نشد | فایرفلای' })
    expect(await thrown(BlogPostPage(props()))).toEqual(new Error('NEXT_NOT_FOUND'))
    expect(postReads()).toHaveLength(1)
    // Its comments are never asked for.
    expect(mocks.apiFetch.mock.calls.some(([path]) => path.endsWith('/comment/list'))).toBe(false)
  })

  it.each(['list', 'a%2Fb', '..'])(
    '“%s” is no post: a 404 without asking the API',
    async (slug) => {
      expect(await thrown(BlogPostPage(props(slug)))).toEqual(new Error('NEXT_NOT_FOUND'))
      expect(mocks.apiFetch.mock.calls.some(([path]) => path.startsWith('blog/post/'))).toBe(false)
    },
  )

  it('any other failure reaches the error boundary', async () => {
    post = () => Promise.reject(new ApiError({ status: 500, code: 'server_error' }))
    await expect(BlogPostPage(props())).rejects.toMatchObject({ status: 500 })
  })
})

describe('the blog switched off while a visitor is on a post', () => {
  it('the proxy says so (a 503): the operator’s reason, and the post is never read', async () => {
    mocks.headers.set('x-ff-blog-off', encodeURIComponent('تا فردا بسته است.'))
    const meta = await view()
    expect(meta.robots).toEqual({ index: false, follow: false })
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'وبلاگ موقتاً در دسترس نیست',
    )
    expect(screen.getByText('تا فردا بسته است.')).toBeInTheDocument()
    expect(postReads()).toHaveLength(0)
  })

  it('the API refuses the read: the same page, and the proxy is told at once', async () => {
    post = () =>
      Promise.reject(
        ApiError.fromBody(503, {
          data: {
            errors: [{ code: 'feature_disabled', detail: 'وبلاگ بسته است.', attr: null }],
            feature: 'blog',
          },
        }),
      )
    await view()
    expect(screen.getByText('وبلاگ بسته است.')).toBeInTheDocument()
    expect(mocks.noteBlogOff).toHaveBeenCalledWith({ reason: 'وبلاگ بسته است.' })
    expect(postReads()).toHaveLength(1)
  })
})
