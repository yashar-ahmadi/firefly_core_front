import { vi } from 'vitest'
import { envelope, failure, type FetchSpy } from '../bff/support'

export type Next = { revalidate?: number; tags?: string[] }

/** Fresh module graph per test so the memoized env picks up the stubs. */
export async function loadApi() {
  vi.resetModules()
  vi.doMock('server-only', () => ({}))
  return import('@/features/settings/api')
}

/** A paginated envelope. */
export function page(results: unknown[], next: string | null = null) {
  return envelope({ count: results.length, total_pages: 1, current_page: 1, next, results })
}

/** Answer by path (plus query); anything not listed is a 500 so a stray call fails the test. */
export function serve(spy: FetchSpy, routes: Record<string, () => Response>) {
  spy.mockImplementation(async (input) => {
    const url = new URL(String(input))
    const route = routes[url.pathname.replace('/api/v1/', '') + url.search]
    return route ? route() : failure(500, 'server_error')
  })
}
