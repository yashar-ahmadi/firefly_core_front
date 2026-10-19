import type { Mock } from 'vitest'
import { ApiError } from '@/lib/api/errors'
import type { PageCard, PageDetail } from '@/lib/api/types/page'
import type { SubjectComment } from '@/lib/api/types/subject-comment'
import { paginated } from '../blog/page-support'
import { PAGE_CARDS } from './page-fixtures'

// The API as a content page's server code reads it (`apiFetch`, mocked per test file): the page
// for a guest's read, the page for a staff token's (a draft's preview), the pages list and the
// comments' first page.

export interface PageApi {
  /** The anonymous read's answer; null: a 404 (missing, or a draft for anyone but staff). */
  page: PageDetail | null
  /** What a read with a token answers (a staff account previewing a draft); null: a 404. */
  staffPage?: PageDetail | null
  list?: PageCard[]
  comments?: SubjectComment[]
}

const notFound = () => new ApiError({ status: 404, code: 'not_found', detail: 'یافت نشد.' })
const ok = (data: unknown) =>
  Promise.resolve({ data, msg: '', status: 200, headers: new Headers() })

/** Answers `apiFetch` as the API would for `api`; anything else is refused (named). */
export function answerPages(apiFetch: Mock, api: PageApi): void {
  apiFetch.mockImplementation((path: string, options: { token?: string | null } = {}) => {
    if (path.startsWith('pages/list')) return ok(paginated(api.list ?? PAGE_CARDS))
    if (path.endsWith('/comment/list')) return ok(paginated(api.comments ?? []))
    if (path.startsWith('pages/')) {
      const answer = options.token ? (api.staffPage ?? null) : api.page
      return answer ? ok(answer) : Promise.reject(notFound())
    }
    return Promise.reject(new Error(`unexpected read: ${path}`))
  })
}

/** The calls `apiFetch` got whose path starts with `prefix`, with their options. */
export function readsOf(apiFetch: Mock, prefix: string): [string, Record<string, unknown>][] {
  return (apiFetch.mock.calls as [string, Record<string, unknown>][]).filter(([path]) =>
    path.startsWith(prefix),
  )
}
