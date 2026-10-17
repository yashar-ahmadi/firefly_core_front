'use client'

import { useEffect, useSyncExternalStore } from 'react'
import {
  keepIdentifier,
  releaseIdentifier,
  takeIdentifier,
  type AuthPage,
} from './identifier-handoff'

const noSubscription = () => () => {}

/**
 * The identifier the previous auth page handed to this one (`identifier-handoff.ts`), '' when
 * none. Taken once: the handoff is cleared as the page reads it, and what it took is forgotten
 * when the page goes, so a later visit starts empty. A page reached by a client navigation (every
 * handing link is one) has it in its first render. A page the server rendered starts empty as the
 * server's HTML did (no hydration mismatch), and has it in the render right after: key the form
 * on it, so its state starts from it.
 */
export function useHandedIdentifier(page: AuthPage): string {
  // False while hydrating the server's HTML, true in a render of the browser's own.
  const ownRender = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  )
  const identifier = ownRender ? takeIdentifier(page) : ''
  useEffect(() => {
    // Kept again on a remount of the same page (Strict Mode's in development).
    keepIdentifier(page, identifier)
    return () => releaseIdentifier(page)
  }, [page, identifier])
  return identifier
}
