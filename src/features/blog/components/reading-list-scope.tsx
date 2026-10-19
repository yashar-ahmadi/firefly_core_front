'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useHydrated } from '@/components/ui/use-media-query'
import { toggleReadingListOnce, useReadingListIds } from '@/features/blog/reading-list'
import { useFeature } from '@/features/settings/feature-context'
import { useSession } from '@/lib/session/session-context'
import { useSessionExpired } from '@/lib/session/use-session-expired'

/** What every bookmark of a grid reads, from one set of subscriptions. */
export interface ReadingListScopeValue {
  /** False during the server render and hydration. */
  hydrated: boolean
  /** The blog switch as the page knows it: off (a refused write said so), no bookmarks. */
  enabled: boolean
  /** Saved post ids (empty for guests); `savedLoading` while a signed-in visitor's are read. */
  saved: ReadonlySet<number>
  savedLoading: boolean
  /** One toggle; the mutation is created by the call. Never rejects. */
  toggle: (post: { id: number; slug: string }) => Promise<void>
}

const ReadingListScopeContext = createContext<ReadingListScopeValue | null>(null)

/** The scope of the nearest post grid, or null outside one. */
export function useReadingListScope(): ReadingListScopeValue | null {
  return useContext(ReadingListScopeContext)
}

/**
 * One scope per grid of post cards: the hydration flag, the reading-list ids query and the blog
 * switch are subscribed to once here instead of in every card, and a card's bookmark creates its
 * write only when pressed (ReadingListButton reads it), as the product cards' CardScope does.
 */
export function ReadingListScope({ children }: { children: ReactNode }) {
  const hydrated = useHydrated()
  const { ids, isLoading } = useReadingListIds()
  const { enabled } = useFeature('blog')
  const { hasSession } = useSession()
  const { push } = useRouter()
  const client = useQueryClient()
  const expire = useSessionExpired()

  const value = useMemo<ReadingListScopeValue>(
    () => ({
      hydrated,
      enabled,
      saved: ids,
      savedLoading: isLoading,
      toggle: (post) => toggleReadingListOnce(client, { hasSession, push, expire }, post),
    }),
    [hydrated, enabled, ids, isLoading, client, hasSession, push, expire],
  )
  return <ReadingListScopeContext value={value}>{children}</ReadingListScopeContext>
}
