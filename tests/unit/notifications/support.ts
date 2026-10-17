import { vi, type Mock } from 'vitest'
import { apiPath, type QueryInit } from '@/lib/api/envelope'
import { ApiError } from '@/lib/api/errors'
import type { Paginated } from '@/lib/api/types/common'
import type { NotificationItem } from '@/lib/api/types/notification'
import { toPersianDigits } from '@/lib/format'

// The inbox's tests share an API stand-in: `notification/list/` answers from `api.list` (by its
// query), `notification/<id>/read/` from `api.read`, each recorded as a `bffFetch` call.

export const LIST = 'notification/list/'
const READ = /^notification\/(\d+)\/read\/$/

type Options = { method?: string; query?: QueryInit; body?: unknown }

export function notification(
  id: number,
  changes: Partial<NotificationItem> = {},
): NotificationItem {
  return {
    id,
    title: `اعلان ${toPersianDigits(id)}`,
    body: `متن اعلان ${toPersianDigits(id)}`,
    image: null,
    topic: null,
    notification_type: 'normal',
    related_object: null,
    is_read: false,
    created: '2026-09-10T15:00:00+03:30',
    updated: '2026-09-10T15:00:00+03:30',
    ...changes,
  }
}

export function inboxPage(
  results: NotificationItem[],
  { page = 1, totalPages = 1, count = results.length, size = 20 } = {},
): Paginated<NotificationItem> {
  const at = (n: number) => `http://localhost:8000/api/v1/${LIST}?limit=${size}&page=${n}`
  return {
    count,
    total_pages: totalPages,
    current_page: page,
    page_size: size,
    next: page < totalPages ? at(page + 1) : null,
    previous: page > 1 ? at(page - 1) : null,
    results,
  }
}

export interface InboxApi {
  /** The list for a query (an `ApiError` is thrown). */
  list: (query: QueryInit) => Paginated<NotificationItem> | ApiError
  /** Answers `POST notification/<id>/read/`. */
  read: Mock<(id: number) => Promise<unknown>>
}

export function newInboxApi(rows: NotificationItem[]): InboxApi {
  return {
    list: (query) => inboxPage(rows, { size: Number(query.limit ?? 20) }),
    read: vi.fn(async () => ({ data: {}, msg: 'نوتیفیکیشن خوانده شد.', status: 200 })),
  }
}

export function stubInboxApi(bffFetch: Mock, api: InboxApi): void {
  bffFetch.mockImplementation(async (path: string, options: Options = {}) => {
    if (path === LIST) {
      const answer = api.list(options.query ?? {})
      if (answer instanceof ApiError) throw answer
      return { data: answer, msg: '', status: 200 }
    }
    const read = READ.exec(path)
    if (read && options.method === 'POST') return api.read(Number(read[1]))
    throw new Error(`unexpected ${options.method ?? 'GET'} ${path}`)
  })
}

/** The list reads made, each as the URL the BFF receives. */
export function listReads(bffFetch: Mock): string[] {
  return bffFetch.mock.calls
    .filter(([path]) => path === LIST)
    .map(([path, options]) => apiPath(path as string, (options as Options | undefined)?.query))
}

/** The ids marked read, in order. */
export const readIds = (api: InboxApi) => api.read.mock.calls.map(([id]) => id)

/** An API error as the BFF passes it on. */
export function apiError(status: number, code: string, data: Record<string, unknown> = {}) {
  return ApiError.fromBody(status, {
    msg: 'خطا',
    data: { type: 'client_error', errors: [{ code, detail: `پیام ${code}`, attr: null }], ...data },
  })
}
