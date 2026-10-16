import {
  MutationObserver,
  useMutation,
  useQuery,
  useQueryClient,
  type MutationOptions,
  type QueryClient,
} from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { notify } from '@/components/ui/toaster'
import { bffFetch } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'
import type { WishlistProductCard } from '@/lib/api/types/catalog'
import type { Paginated } from '@/lib/api/types/common'
import { loginHref } from '@/lib/links/login'
import { useSession } from '@/lib/session/session-context'

// The signed-in visitor's saved products, as a set of product ids for the hearts on cards.
// Pages are cached for everyone without a token, so the hearts are filled in on the client.

/** The query holding the saved product ids (a `number[]`). */
export const WISHLIST_IDS_KEY = ['wishlist', 'ids'] as const
const TOGGLE_KEY = ['wishlist', 'toggle'] as const

const PAGE_SIZE = 100
/** Stops a `next` link that never ends; 10,000 saved products is far past any real list. */
const MAX_PAGES = 100
/** Our own toggles keep the cache right, so it only needs a refresh now and then. */
const STALE_TIME = 5 * 60_000

const GENERIC_ERROR = 'خطایی رخ داد. لطفاً دوباره تلاش کنید.'

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
 * page). An error, a 401 from an expired session included, leaves the set empty: it never throws.
 */
export function useWishlistIds(): WishlistIds {
  const { hasSession } = useSession()
  const query = useQuery({
    queryKey: WISHLIST_IDS_KEY,
    queryFn: ({ signal }) => fetchWishlistIds(signal),
    enabled: hasSession,
    staleTime: STALE_TIME,
    select: toIdSet,
  })
  return { ids: (hasSession && query.data) || NO_IDS, isLoading: query.isLoading }
}

interface ToggleVariables {
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
 * and shows the API's message, and a 401 (session gone) goes to login. After the last toggle
 * settles the ids are read again, so the cache ends up matching the server.
 */
function toggleOptions(
  client: QueryClient,
  router: Router,
): MutationOptions<ToggleResult, Error, ToggleVariables> {
  return {
    mutationKey: TOGGLE_KEY,
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
      if (error instanceof ApiError && error.isAuth()) router.push(loginHref(currentPath()))
      else notify.error(error instanceof ApiError ? error.detail : GENERIC_ERROR)
    },
    onSettled: () => {
      // Only after the last of several quick toggles, so a read never lands between them.
      if (client.isMutating({ mutationKey: TOGGLE_KEY }) === 1) {
        void client.invalidateQueries({ queryKey: WISHLIST_IDS_KEY })
      }
    },
  }
}

/** Whether `id` is among the cached saved ids. */
const isSaved = (client: QueryClient, id: number) =>
  client.getQueryData<number[]>(WISHLIST_IDS_KEY)?.includes(id) ?? false

/**
 * One toggle without a hook: the mutation is created when it is called (a product card creates
 * none until its heart is pressed). Guests go to the login page. Never rejects.
 */
export function toggleWishlistOnce(
  client: QueryClient,
  router: Router,
  hasSession: boolean,
  { id, slug }: { id: number; slug: string },
): Promise<void> {
  if (!hasSession) {
    router.push(loginHref(currentPath()))
    return Promise.resolve()
  }
  return new MutationObserver(client, toggleOptions(client, router))
    .mutate({ id, slug, save: !isSaved(client, id) })
    .then(
      () => undefined,
      () => undefined,
    )
}

/** The optimistic wishlist toggle (`toggleOptions`) as a hook, for a single heart. */
export function useToggleWishlist(): ToggleWishlist {
  const { hasSession } = useSession()
  const router = useRouter()
  const client = useQueryClient()
  const mutation = useMutation(toggleOptions(client, router))

  const toggle = ({ id, slug }: { id: number; slug: string }) => {
    if (!hasSession) {
      router.push(loginHref(currentPath()))
      return
    }
    mutation.mutate({ id, slug, save: !isSaved(client, id) })
  }

  return { toggle, isPending: mutation.isPending }
}
