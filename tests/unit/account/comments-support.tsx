import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, type Mock } from 'vitest'
import { CommentsPage } from '@/features/account/comments/comments-page'
import type { FeatureMap } from '@/features/settings/feature-context'
import { apiPath, type QueryInit } from '@/lib/api/envelope'
import { ApiError } from '@/lib/api/errors'
import type { Paginated } from '@/lib/api/types/common'
import type { MyComment } from '@/lib/api/types/dashboard'
import { ME_KEY } from '@/lib/session/viewer-queries'
import { SARA } from '../auth/fixtures'
import { authProviders } from '../support/auth-providers'
import { commentsPage, SARA_COMMENTS } from './comment-fixtures'
import { ok, summary } from './fixtures'

// «دیدگاه‌های من»'s tests share an API stand-in: the list answers from `api.list` (by its query),
// the summary from `api.count`, and the delete from `api.remove`, each recorded as a `bffFetch`
// call. The page reads its filters from `mocks.search` (the URL's query).

export const COMMENTS_LIST = 'dashboard/comment/list/'

type Options = { method?: string; query?: QueryInit }

export interface CommentsApi {
  /** The list's answer for a query (an `ApiError` is thrown). */
  list: (query: QueryInit) => Paginated<MyComment> | ApiError
  /** The summary's `comment_count`. */
  count: number
  /** Answers `DELETE dashboard/comment/<type>/<id>/delete/`. */
  remove: Mock<(type: string, id: number) => Promise<unknown>>
}

export function newCommentsApi(): CommentsApi {
  return {
    list: () => commentsPage(SARA_COMMENTS),
    count: SARA_COMMENTS.length,
    remove: vi.fn(async () => ({ data: null, msg: '', status: 204 })),
  }
}

const DELETE = /^dashboard\/comment\/(product|post|page)\/(\d+)\/delete\/$/

export function stubCommentsApi(bffFetch: Mock, api: CommentsApi) {
  bffFetch.mockImplementation(async (path: string, options: Options = {}) => {
    if (path === 'dashboard/summary/') return ok(summary({ comment_count: api.count }))
    if (path === 'account/profile/me/') return ok(SARA)
    if (path === COMMENTS_LIST) {
      const answer = api.list(options.query ?? {})
      if (answer instanceof ApiError) throw answer
      return ok(answer)
    }
    const removal = DELETE.exec(path)
    if (removal && options.method === 'DELETE') return api.remove(removal[1]!, Number(removal[2]))
    throw new Error(`unexpected ${options.method ?? 'GET'} ${path}`)
  })
}

/** The list reads made, each as the URL the BFF receives (repeated keys show as such). */
export function listReads(bffFetch: Mock): string[] {
  return bffFetch.mock.calls
    .filter(([path]) => path === COMMENTS_LIST)
    .map(([path, options]) => apiPath(path as string, (options as Options | undefined)?.query))
}

/** The calls to `path` (by method). */
export const callsTo = (bffFetch: Mock, path: string, method = 'GET') =>
  bffFetch.mock.calls.filter(
    ([called, options]) => called === path && ((options as Options)?.method ?? 'GET') === method,
  )

/** An API error as the BFF passes it on. */
export function apiError(status: number, code: string, data: Record<string, unknown> = {}) {
  return ApiError.fromBody(status, {
    msg: 'خطا',
    data: { type: 'client_error', errors: [{ code, detail: `پیام ${code}`, attr: null }], ...data },
  })
}

/** The page signed in as sara; `retry: false` so a failed read shows at once. */
export function renderComments({ features = {} }: { features?: Partial<FeatureMap> } = {}) {
  const providers = authProviders({ hasSession: true, features })
  providers.client.setQueryData(ME_KEY, SARA)
  providers.client.setQueryDefaults(['dashboard'], { retry: false })
  const user = userEvent.setup()
  const view = render(<CommentsPage title="دیدگاه‌های من" />, { wrapper: providers.wrapper })
  return { user, client: providers.client, ...view }
}
