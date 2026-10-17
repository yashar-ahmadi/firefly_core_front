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

// Whether the visitor is signed in, as far as the page knows. The tokens themselves are
// httpOnly; the root layout reads the `ff_auth` flag cookie for the first value, and sign-in
// and sign-out flows update it with `setHasSession`.

export interface SessionState {
  hasSession: boolean
  setHasSession: (hasSession: boolean) => void
  /**
   * Turns the session off, and says whether this call did it: false when it had already ended,
   * even earlier in the same tick (several session calls failing at once), before React has
   * re-rendered with the new value. Stable.
   */
  endSession: () => boolean
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
  useEffect(() => {
    live.current = hasSession
  }, [hasSession])

  const setHasSession = useCallback((next: boolean) => {
    live.current = next
    setState(next)
  }, [])
  const endSession = useCallback(() => {
    if (!live.current) return false
    setHasSession(false)
    return true
  }, [setHasSession])

  const value = useMemo(
    () => ({ hasSession, setHasSession, endSession }),
    [hasSession, setHasSession, endSession],
  )
  return <SessionContext value={value}>{children}</SessionContext>
}

/** The session flag and its setter. Throws outside `SessionProvider` (the root providers). */
export function useSession(): SessionState {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession must be used inside SessionProvider')
  return session
}
