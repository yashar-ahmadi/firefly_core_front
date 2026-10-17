'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { flagCookieValue } from './flag-cookie'

// Whether the visitor is signed in, as far as the page knows. The tokens themselves are
// httpOnly; the root layout reads the `ff_auth` flag cookie for the first value, and sign-in
// and sign-out flows update it with `setHasSession`. The tab also remembers which login its
// session is (the flag cookie's marker, `isSessionMarker`): the one it loaded with, or the one
// it signed in with since.

export interface SessionState {
  hasSession: boolean
  /** Turning it on takes the flag cookie's marker as this tab's session. Stable. */
  setHasSession: (hasSession: boolean) => void
  /**
   * Turns the session off, and says whether this call did it: false when it had already ended,
   * even earlier in the same tick (several session calls failing at once), before React has
   * re-rendered with the new value. Stable.
   */
  endSession: () => boolean
  /**
   * Whether the flag cookie now holds another login's marker than this tab's session: someone
   * signed in elsewhere since (a logout, then a login, in another tab), so what this tab shows
   * is the previous visitor's. False without a session here or without the cookie. Stable.
   */
  sessionReplaced: () => boolean
}

const SessionContext = createContext<SessionState | null>(null)

export function SessionProvider({
  initialHasSession,
  children,
}: {
  initialHasSession: boolean
  children: ReactNode
}) {
  const [hasSession, setState] = useState(initialHasSession)
  // The value as of the last change, read by `endSession` before the next render.
  const live = useRef(initialHasSession)
  // A server re-render (router.refresh()) brings a newer flag: it replaces the local value.
  const [serverValue, setServerValue] = useState(initialHasSession)
  if (serverValue !== initialHasSession) {
    setServerValue(initialHasSession)
    setState(initialHasSession)
  }
  // This tab's session marker: the one it loaded with, signed in with (`setHasSession(true)`) or
  // had when a server render turned the session on; null without a session. A child that asks
  // first (effects run children first) takes the cookie's value then.
  const marker = useRef<string | null>(null)
  useEffect(() => {
    live.current = hasSession
    marker.current = hasSession ? (marker.current ?? flagCookieValue()) : null
  }, [hasSession])

  const setHasSession = useCallback((next: boolean) => {
    live.current = next
    marker.current = next ? flagCookieValue() : null
    setState(next)
  }, [])
  const endSession = useCallback(() => {
    if (!live.current) return false
    setHasSession(false)
    return true
  }, [setHasSession])
  const sessionReplaced = useCallback(() => {
    if (!live.current) return false
    const now = flagCookieValue()
    // Not known yet (a session the server's render brought): it is the one there now.
    marker.current ??= now
    return now !== null && now !== marker.current
  }, [])

  const value = useMemo(
    () => ({ hasSession, setHasSession, endSession, sessionReplaced }),
    [hasSession, setHasSession, endSession, sessionReplaced],
  )
  return <SessionContext value={value}>{children}</SessionContext>
}

/** The session flag and its setter. Throws outside `SessionProvider` (the root providers). */
export function useSession(): SessionState {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession must be used inside SessionProvider')
  return session
}
