'use client'

import { matchMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react'
import { productPath } from '@/features/catalog/listing-routes'
import {
  toggleWishlistOnce,
  WISHLIST_TOGGLE_KEY,
  type WishlistToggle,
} from '@/features/wishlist/hooks'
import type { WishlistProductCard } from '@/lib/api/types/catalog'
import { useSession } from '@/lib/session/session-context'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { tell } from '../tell'

/** How long the toast offers «بازگردانی» (it waits while hovered or focused). */
const UNDO_MS = 10_000

/** The name link of `slug`'s card in the grid: what a card's focus moves to. */
function cardLink(grid: HTMLElement | null, slug: string): HTMLElement | null {
  return grid?.querySelector<HTMLElement>(`article h3 a[href="${productPath(slug)}"]`) ?? null
}

/**
 * Whether the focus may be moved: it went with what had it (a card that left the grid), or it
 * waits on the page's heading, where «بازگردانی» puts it (the toast holding it is closing).
 */
const focusFree = (pageHeading: HTMLElement | null) => {
  const active = document.activeElement
  return !active || active === document.body || active === pageHeading
}

const without = (ids: ReadonlySet<number>, id: number) =>
  new Set([...ids].filter((other) => other !== id))

export interface WishlistRemovalsOptions {
  /** The page's list as read, in order. */
  results: readonly WishlistProductCard[]
  page: number
  grid: RefObject<HTMLElement | null>
  pageHeading: RefObject<HTMLElement | null>
  goToPage: (page: number) => void
  /** The list is being read (`isFetching`): a card «بازگردانی» brought back may be on its way. */
  reading: boolean
}

/**
 * Hearts pressed while the wishlist page is open (a card's, or quick view's: every heart's write
 * goes through the shared toggle, P3-R4). Once a removal succeeded its card leaves the grid at
 * once (the list is read again meanwhile, by the toggle), it is said, and the toast offers
 * «بازگردانی», which saves it again; a save brings a removed card back. When the card that went
 * had the focus, the next card's link takes it (else the previous one's, else the page's
 * heading); after «بازگردانی», the card that came back. The last card of a page after the first
 * goes to the page before. A removal that succeeds after the visitor went to another view is
 * still said (the name from the cards last seen); a card that comes back on another page leaves
 * the focus on the heading once the list read after the write is in. Returns the cards to show:
 * `results` without those taken out.
 */
export function useWishlistRemovals({
  results,
  page,
  grid,
  pageHeading,
  goToPage,
  reading,
}: WishlistRemovalsOptions): WishlistProductCard[] {
  const client = useQueryClient()
  const { hasSession } = useSession()
  const router = useRouter()
  const expire = useSessionExpired()
  const [removed, setRemoved] = useState<ReadonlySet<number>>(() => new Set())
  const products = results.filter((product) => !removed.has(product.id))
  // Every card shown on this page so far, by id: a write can land after its card left the view.
  const seen = useRef(new Map<number, WishlistProductCard>())
  useEffect(() => {
    for (const product of results) seen.current.set(product.id, product)
  }, [results])
  // Where the focus goes once the grid shows the change (a slug's card, or the page heading).
  const focusTarget = useRef<string | 'page' | null>(null)
  const [focusRequest, setFocusRequest] = useState(0)
  const moveFocus = (target: string | 'page') => {
    focusTarget.current = target
    setFocusRequest((count) => count + 1)
  }

  const restore = (product: WishlistProductCard) => {
    // The toast goes with the press: the focus waits on the heading for the card to come back.
    pageHeading.current?.focus()
    void toggleWishlistOnce(
      client,
      { hasSession, router, expire },
      { id: product.id, slug: product.slug, save: true },
    )
  }

  const written = useEffectEvent(({ id, slug, save }: WishlistToggle) => {
    if (save) {
      if (!removed.has(id)) return
      setRemoved((ids) => without(ids, id))
      if (focusFree(pageHeading.current)) moveFocus(slug)
      return
    }
    setRemoved((ids) => new Set(ids).add(id))
    const index = products.findIndex((product) => product.id === id)
    const product = products[index] ?? seen.current.get(id)
    if (!product) return
    tell(`«${product.name}» از علاقه‌مندی‌ها حذف شد.`, 'success', {
      action: { label: 'بازگردانی', onClick: () => restore(product) },
      duration: UNDO_MS,
    })
    // Its card is on another view now (the visitor moved on): nothing here changes.
    if (index < 0) return
    const remaining = products.filter((other) => other.id !== id)
    const card = cardLink(grid.current, slug)?.closest('article')
    if (focusFree(pageHeading.current) || card?.contains(document.activeElement)) {
      const next = remaining[index] ?? remaining[index - 1]
      moveFocus(next ? next.slug : 'page')
    }
    if (remaining.length === 0 && page > 1) goToPage(page - 1)
  })

  useEffect(
    () =>
      client.getMutationCache().subscribe((event) => {
        if (event.type !== 'updated' || event.action.type !== 'success') return
        if (!matchMutation({ mutationKey: WISHLIST_TOGGLE_KEY }, event.mutation)) return
        written(event.mutation.state.variables as WishlistToggle)
      }),
    [client],
  )

  useEffect(() => {
    const target = focusTarget.current
    if (target === null) return
    // Never taken from where the visitor has moved it meanwhile.
    if (!focusFree(pageHeading.current)) {
      focusTarget.current = null
      return
    }
    const element = target === 'page' ? pageHeading.current : cardLink(grid.current, target)
    if (!element) {
      // The list read after the write is in without the card (it came back on another page or
      // sort): the focus stays on the heading, and nothing waits to take it later.
      if (!reading) focusTarget.current = null
      return
    }
    focusTarget.current = null
    element.focus()
  }, [focusRequest, results, removed, reading, grid, pageHeading])

  return products
}
