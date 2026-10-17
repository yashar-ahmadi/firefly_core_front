import {
  useMutation,
  useQuery,
  useQueryClient,
  type MutationOptions,
  type QueryClient,
} from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { notify } from '@/components/ui/toaster'
import { bffFetch } from '@/lib/api/client'
import { ApiError, GENERIC_ERROR_DETAIL } from '@/lib/api/errors'
import type { WishlistProductCard } from '@/lib/api/types/catalog'
import type { Paginated } from '@/lib/api/types/common'
import { loginHref } from '@/lib/links/login'
import { runMutation } from '@/lib/query/run-mutation'
import { useSession } from '@/lib/session/session-context'
import { useSessionExpired, type SessionExpired } from '@/lib/session/use-session-expired'
import { isSessionExpiredError, SUMMARY_KEY } from '@/lib/session/viewer-queries'
import { withSessionExpiry } from '@/lib/session/with-session-expiry'

// The signed-in visitor's saved products, as a set of product ids for the hearts on cards.
// Pages are cached for everyone without a token, so the hearts are filled in on the client.

/** Every wishlist query: the ids below and the account wishlist page's lists. */
const WISHLIST_KEY = ['wishlist'] as const
/** The query holding the saved product ids (a `number[]`). */
export const WISHLIST_IDS_KEY = ['wishlist', 'ids'] as const
/** Every heart's write (a save or a removal), with `WishlistToggle` variables. */
export const WISHLIST_TOGGLE_KEY = ['wishlist', 'toggle'] as const

const PAGE_SIZE = 100
/** Stops a `next` link that never ends; 10,000 saved products is far past any real list. */
const MAX_PAGES = 100
/** Our own toggles keep the cache right, so it only needs a refresh now and then. */
const STALE_TIME = 5 * 60_000

type WishlistPage = Paginated<Pick<WishlistProductCard, 'id'>>

async function fetchWishlistIds(signal: AbortSignal): Promise<number[]> {
  const ids: number[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data } = await bffFetch<WishlistPage>('product/wishlist/list/', {
      query: { limit: PAGE_SIZE, page },
      signal,
    })
    ids.push(...data.results.map((product) => product.id))
    if (!data.next) break
  }
  return ids
}

const toIdSet = (ids: number[]) => new Set(ids)
const NO_IDS = new Set<number>()

export interface WishlistIds {
  /** Saved product ids; empty for guests, while loading and after an error. Do not mutate. */
  ids: Set<number>
  isLoading: boolean
}

/**
 * The saved product ids, read only with a session (`GET product/wishlist/list/?limit=100`, every
 * page). An error leaves the set empty: it never throws. A 401 because the session is gone ends
 * it (`useSessionExpired`), so no heart mounted later asks again.
 */
export function useWishlistIds(): WishlistIds {
  const { hasSession } = useSession()
  const expire = useSessionExpired()
  const read = withSessionExpiry(fetchWishlistIds, expire, (): number[] => [])
  const query = useQuery({
    queryKey: WISHLIST_IDS_KEY,
    queryFn: ({ signal }) => read(signal),
    enabled: hasSession,
    staleTime: STALE_TIME,
    select: toIdSet,
  })
  return { ids: (hasSession && query.data) || NO_IDS, isLoading: query.isLoading }
}

export interface WishlistToggle {
  id: number
  slug: string
  /** true: save (POST); false: remove (DELETE, answered with 204). */
  save: boolean
}

/** Marks `id` saved or not in the cached ids; does nothing before the first load. */
function setSaved(client: QueryClient, id: number, saved: boolean): void {
  client.setQueryData<number[]>(WISHLIST_IDS_KEY, (ids) => {
    if (ids === undefined) return ids
    if (!saved) return ids.filter((listed) => listed !== id)
    return ids.includes(id) ? ids : [...ids, id]
  })
}

/** The page to come back to after signing in, query string included. */
function currentPath(): string {
  return `${window.location.pathname}${window.location.search}`
}

export interface ToggleWishlist {
  /** Saves the product, or removes it when it is saved. Guests go to the login page. */
  toggle: (product: { id: number; slug: string }) => void
  isPending: boolean
}

type Router = Pick<ReturnType<typeof useRouter>, 'push'>
type ToggleResult = Awaited<ReturnType<typeof bffFetch<{ is_in_wishlist: boolean } | null>>>

/**
 * The optimistic toggle as mutation options. The heart flips at once; a failure flips it back
 * and shows the API's message, and a 401 because the session is gone ends it and goes to login
 * (`expire`). After the last toggle settles the ids, the account wishlist page's lists and the
 * account summary (which counts them) are read again, so the cache ends up matching the server.
 */
function toggleOptions(
  client: QueryClient,
  expire: SessionExpired,
): MutationOptions<ToggleResult, Error, WishlistToggle> {
  return {
    mutationKey: WISHLIST_TOGGLE_KEY,
    mutationFn: ({ slug, save }) =>
      bffFetch<{ is_in_wishlist: boolean } | null>(`product/detail/${slug}/wishlist/`, {
        method: save ? 'POST' : 'DELETE',
      }),
    onMutate: async ({ id, save }) => {
      // A read in flight would overwrite the optimistic change with older data.
      await client.cancelQueries({ queryKey: WISHLIST_IDS_KEY })
      setSaved(client, id, save)
    },
    onSuccess: (result, { save }) => {
      // The API's message is meant to be shown for a save (product digest §1.2).
      if (save && result.msg) notify.success(result.msg)
    },
    onError: (error, { id, save }) => {
      setSaved(client, id, !save)
      if (isSessionExpiredError(error)) expire({ toLogin: true })
      else notify.error(error instanceof ApiError ? error.detail : GENERIC_ERROR_DETAIL)
    },
    onSettled: () => {
      // Only after the last of several quick toggles, so a read never lands between them: the
      // ids and the wishlist page's lists, and the account summary, which counts the wishlist
      // (`wishlist_count`).
      if (client.isMutating({ mutationKey: WISHLIST_TOGGLE_KEY }) === 1) {
        void client.invalidateQueries({ queryKey: WISHLIST_KEY })
        void client.invalidateQueries({ queryKey: SUMMARY_KEY })
      }
    },
  }
}

/** Whether `id` is among the cached saved ids. */
const isSaved = (client: QueryClient, id: number) =>
  client.getQueryData<number[]>(WISHLIST_IDS_KEY)?.includes(id) ?? false

/** What a toggle without a hook needs from the page (CardScope reads it once per grid). */
export interface WishlistViewer {
  hasSession: boolean
  router: Router
  /** `useSessionExpired()`. */
  expire: SessionExpired
}

/**
 * One toggle without a hook: the mutation is created when it is called (a product card creates
 * none until its heart is pressed). `save` says which way («بازگردانی» saves); by default the
 * opposite of the cached state. Guests go to the login page. Never rejects.
 */
export function toggleWishlistOnce(
  client: QueryClient,
  { hasSession, router, expire }: WishlistViewer,
  { id, slug, save = !isSaved(client, id) }: { id: number; slug: string; save?: boolean },
): Promise<void> {
  if (!hasSession) {
    router.push(loginHref(currentPath()))
    return Promise.resolve()
  }
  return runMutation(client, toggleOptions(client, expire), { id, slug, save }).then(
    () => undefined,
    () => undefined,
  )
}

/** The optimistic wishlist toggle (`toggleOptions`) as a hook, for a single heart. */
export function useToggleWishlist(): ToggleWishlist {
  const { hasSession } = useSession()
  const router = useRouter()
  const client = useQueryClient()
  const expire = useSessionExpired()
  const mutation = useMutation(toggleOptions(client, expire))

  const toggle = ({ id, slug }: { id: number; slug: string }) => {
    if (!hasSession) {
      router.push(loginHref(currentPath()))
      return
    }
    mutation.mutate({ id, slug, save: !isSaved(client, id) })
  }

  return { toggle, isPending: mutation.isPending }
}
