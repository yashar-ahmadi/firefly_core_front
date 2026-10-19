'use client'

import { matchMutation, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react'
import { tell } from '@/components/ui/tell'

// An account list of saved things (the wishlist's products, the reading list's posts) whose cards
// go as their toggle removes them, with «بازگردانی».

/** How long the toast offers «بازگردانی» (it waits while hovered or focused). */
const UNDO_MS = 10_000

/** A saved thing's toggle write, as its mutation's variables. */
export interface SavedToggle {
  id: number
  slug: string
  /** true: save; false: remove. */
  save: boolean
}

/** What a list holds: a card per item, named. */
export interface SavedItem {
  id: number
  slug: string
  name: string
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

export interface ListRemovalsOptions<T extends SavedItem> {
  /** The page's list as read, in order. */
  results: readonly T[]
  page: number
  grid: RefObject<HTMLElement | null>
  pageHeading: RefObject<HTMLElement | null>
  goToPage: (page: number) => void
  /** The list is being read (`isFetching`): a card «بازگردانی» brought back may be on its way. */
  reading: boolean
  /** The toggle's mutation key: its successes are the removals and restores (`SavedToggle`). */
  mutationKey: QueryKey
  /** The link of `slug`'s card in the grid: what a card's focus moves to. */
  cardLink: (grid: HTMLElement | null, slug: string) => HTMLElement | null
  /** «بازگردانی»: saves the item again (the toggle with `save: true`). */
  restore: (item: T) => void
  /** The toast's sentence for a removed item. */
  removedMessage: (item: T) => string
}

/**
 * Toggles pressed while the list's page is open (a card's, or one elsewhere on the page: every
 * toggle's write goes through the shared mutation). Once a removal succeeded its card leaves the
 * grid at once (the list is read again meanwhile, by the toggle), it is said, and the toast
 * offers «بازگردانی», which saves it again; a save brings a removed card back. When the card that
 * went had the focus, the next card's link takes it (else the previous one's, else the page's
 * heading); after «بازگردانی», the card that came back. The last card of a page after the first
 * goes to the page before. A removal that succeeds after the visitor went to another view is
 * still said (the name from the cards last seen); a card that comes back on another page leaves
 * the focus on the heading once the list read after the write is in. Returns the cards to show:
 * `results` without those taken out.
 */
export function useListRemovals<T extends SavedItem>({
  results,
  page,
  grid,
  pageHeading,
  goToPage,
  reading,
  mutationKey,
  cardLink,
  restore,
  removedMessage,
}: ListRemovalsOptions<T>): T[] {
  const client = useQueryClient()
  const [removed, setRemoved] = useState<ReadonlySet<number>>(() => new Set())
  const items = results.filter((item) => !removed.has(item.id))
  // Every card shown on this page so far, by id: a write can land after its card left the view.
  const seen = useRef(new Map<number, T>())
  useEffect(() => {
    for (const item of results) seen.current.set(item.id, item)
  }, [results])
  // Where the focus goes once the grid shows the change (a slug's card, or the page heading).
  const focusTarget = useRef<string | 'page' | null>(null)
  const [focusRequest, setFocusRequest] = useState(0)
  const moveFocus = (target: string | 'page') => {
    focusTarget.current = target
    setFocusRequest((count) => count + 1)
  }

  const undo = (item: T) => {
    // The toast goes with the press: the focus waits on the heading for the card to come back.
    pageHeading.current?.focus()
    restore(item)
  }

  const written = useEffectEvent(({ id, slug, save }: SavedToggle) => {
    if (save) {
      if (!removed.has(id)) return
      setRemoved((ids) => without(ids, id))
      if (focusFree(pageHeading.current)) moveFocus(slug)
      return
    }
    setRemoved((ids) => new Set(ids).add(id))
    const index = items.findIndex((item) => item.id === id)
    const item = items[index] ?? seen.current.get(id)
    if (!item) return
    // Sonner keeps the closing toast pressable for a moment: the undo runs once.
    let undone = false
    tell(removedMessage(item), 'success', {
      action: {
        label: 'بازگردانی',
        onClick: () => {
          if (undone) return
          undone = true
          undo(item)
        },
      },
      duration: UNDO_MS,
    })
    // Its card is on another view now (the visitor moved on): nothing here changes.
    if (index < 0) return
    const remaining = items.filter((other) => other.id !== id)
    const card = cardLink(grid.current, slug)?.closest('article')
    if (focusFree(pageHeading.current) || card?.contains(document.activeElement)) {
      const next = remaining[index] ?? remaining[index - 1]
      moveFocus(next ? next.slug : 'page')
    }
    if (remaining.length === 0 && page > 1) goToPage(page - 1)
  })

  const key = JSON.stringify(mutationKey)
  useEffect(
    () =>
      client.getMutationCache().subscribe((event) => {
        if (event.type !== 'updated' || event.action.type !== 'success') return
        if (!matchMutation({ mutationKey: JSON.parse(key) as QueryKey }, event.mutation)) return
        written(event.mutation.state.variables as SavedToggle)
      }),
    [client, key],
  )

  const linkOf = useEffectEvent((slug: string) => cardLink(grid.current, slug))
  useEffect(() => {
    const target = focusTarget.current
    if (target === null) return
    // Never taken from where the visitor has moved it meanwhile.
    if (!focusFree(pageHeading.current)) {
      focusTarget.current = null
      return
    }
    const element = target === 'page' ? pageHeading.current : linkOf(target)
    if (!element) {
      // The list read after the write is in without the card (it came back on another page or
      // sort): the focus stays on the heading, and nothing waits to take it later.
      if (!reading) focusTarget.current = null
      return
    }
    focusTarget.current = null
    element.focus()
  }, [focusRequest, results, removed, reading, grid, pageHeading])

  return items
}
