import { useQuery, type MutationOptions, type QueryClient } from '@tanstack/react-query'
import { notify } from '@/components/ui/toaster'
import { bffFetch } from '@/lib/api/client'
import { ApiError, GENERIC_ERROR_DETAIL } from '@/lib/api/errors'
import type { Paginated } from '@/lib/api/types/common'
import type { ReadingListPost } from '@/lib/api/types/blog'
import { loginHref } from '@/lib/links/login'
import { runMutation } from '@/lib/query/run-mutation'
import { useSession } from '@/lib/session/session-context'
import { useSessionExpired, type SessionExpired } from '@/lib/session/use-session-expired'
import { isSessionExpiredError, SUMMARY_KEY } from '@/lib/session/viewer-queries'
import { withSessionExpiry } from '@/lib/session/with-session-expiry'

// The signed-in visitor's reading list (blog digest §1.8), as a set of post ids for the bookmark
// on post cards: blog pages are cached for everyone without a token, so the bookmarks are filled
// in on the client, like the wishlist's hearts. Imported by the blog's cards only, never by a
// catalog route.

/** Every reading-list query (registered in SESSION_QUERIES): the ids and the account page's lists. */
export const READING_LIST_KEY = ['reading-list'] as const
/** The saved post ids (a `number[]`). */
export const READING_LIST_IDS_KEY = ['reading-list', 'ids'] as const
/** Every bookmark's write, with `ReadingListToggle` variables. */
export const READING_LIST_TOGGLE_KEY = ['reading-list', 'toggle'] as const

const PAGE_SIZE = 100
/** Stops a `next` link that never ends; 10,000 saved posts is far past any real list. */
const MAX_PAGES = 100
/** Our own toggles keep the cache right, so it only needs a refresh now and then. */
const STALE_TIME = 5 * 60_000

async function fetchReadingListIds(signal: AbortSignal): Promise<number[]> {
  const ids: number[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data } = await bffFetch<Paginated<Pick<ReadingListPost, 'id'>>>(
      'blog/reading-list/list/',
      { query: { limit: PAGE_SIZE, page }, signal },
    )
    ids.push(...data.results.map((post) => post.id))
    if (!data.next) break
  }
  return ids
}

const toIdSet = (ids: number[]) => new Set(ids)
const NO_IDS = new Set<number>()

export interface ReadingListIds {
  /** Saved post ids; empty for guests, while loading and after an error. Do not mutate. */
  ids: ReadonlySet<number>
  isLoading: boolean
}

/**
 * The saved post ids, read only with a session (every page of `blog/reading-list/list/`, 100 at a
 * time). An error leaves the set empty: it never throws. A 401 because the session is gone ends
 * it (`useSessionExpired`), so no bookmark mounted later asks again.
 */
export function useReadingListIds(): ReadingListIds {
  const { hasSession } = useSession()
  const expire = useSessionExpired()
  const read = withSessionExpiry(fetchReadingListIds, expire, (): number[] => [])
  const query = useQuery({
    queryKey: READING_LIST_IDS_KEY,
    queryFn: ({ signal }) => read(signal),
    enabled: hasSession,
    staleTime: STALE_TIME,
    select: toIdSet,
  })
  return { ids: (hasSession && query.data) || NO_IDS, isLoading: query.isLoading }
}

export interface ReadingListToggle {
  id: number
  slug: string
  /** true: save (POST); false: remove (DELETE, answered with 204 and no body). */
  save: boolean
}

/** Marks `id` saved or not in the cached ids; does nothing before the first load. */
function setSaved(client: QueryClient, id: number, saved: boolean): void {
  client.setQueryData<number[]>(READING_LIST_IDS_KEY, (ids) => {
    if (ids === undefined) return ids
    if (!saved) return ids.filter((listed) => listed !== id)
    return ids.includes(id) ? ids : [...ids, id]
  })
}

type ToggleResult = Awaited<ReturnType<typeof bffFetch<{ is_in_reading_list: boolean } | null>>>

/**
 * The optimistic toggle. The bookmark flips at once and the answer settles it (POST's
 * `data.is_in_reading_list`; DELETE's 204), so a press is one request: the ids are not read
 * again. A failure flips it back and shows the API's message (a switched-off blog's reason
 * too; the QueryClient turns the switch off); a 401 because the session is gone ends it and goes
 * to login. After the last of quick toggles, the account summary (its `reading_list_count`
 * badge) and the account page's lists are marked stale: read again where they are on screen.
 */
function toggleOptions(
  client: QueryClient,
  expire: SessionExpired,
): MutationOptions<ToggleResult, Error, ReadingListToggle> {
  return {
    mutationKey: READING_LIST_TOGGLE_KEY,
    mutationFn: ({ slug, save }) =>
      bffFetch<{ is_in_reading_list: boolean } | null>(`blog/post/${slug}/reading-list/`, {
        method: save ? 'POST' : 'DELETE',
      }),
    onMutate: async ({ id, save }) => {
      // A read in flight would overwrite the optimistic change with older data.
      await client.cancelQueries({ queryKey: READING_LIST_IDS_KEY })
      setSaved(client, id, save)
    },
    onSuccess: (result, { id, save }) => {
      if (!save) return
      setSaved(client, id, result.data?.is_in_reading_list !== false)
      if (result.msg) notify.success(result.msg)
    },
    onError: (error, { id, save }) => {
      setSaved(client, id, !save)
      if (isSessionExpiredError(error)) expire({ toLogin: true })
      else notify.error(error instanceof ApiError ? error.detail : GENERIC_ERROR_DETAIL)
    },
    onSettled: () => {
      if (client.isMutating({ mutationKey: READING_LIST_TOGGLE_KEY }) !== 1) return
      void client.invalidateQueries({ queryKey: SUMMARY_KEY })
      void client.invalidateQueries({
        queryKey: READING_LIST_KEY,
        predicate: (query) => query.queryKey[1] !== 'ids',
      })
    },
  }
}

/** Whether `id` is among the cached saved ids. */
const isSaved = (client: QueryClient, id: number) =>
  client.getQueryData<number[]>(READING_LIST_IDS_KEY)?.includes(id) ?? false

/** What a toggle without a hook needs from the page (the scope reads it once per grid). */
export interface ReadingListViewer {
  hasSession: boolean
  push: (href: string) => void
  /** `useSessionExpired()`. */
  expire: SessionExpired
}

/**
 * One toggle without a hook: the mutation is created when it is called (a card creates none
 * until its bookmark is pressed), the opposite of the cached state unless `save` says (the
 * reading list page's «بازگردانی»). A guest goes to the login page, with this page as `next`.
 * Never rejects.
 */
export function toggleReadingListOnce(
  client: QueryClient,
  { hasSession, push, expire }: ReadingListViewer,
  { id, slug, save = !isSaved(client, id) }: { id: number; slug: string; save?: boolean },
): Promise<void> {
  if (!hasSession) {
    push(loginHref(`${window.location.pathname}${window.location.search}`))
    return Promise.resolve()
  }
  const variables = { id, slug, save }
  return runMutation(client, toggleOptions(client, expire), variables).then(
    () => undefined,
    () => undefined,
  )
}
