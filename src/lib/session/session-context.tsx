'use client'

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

// Whether the visitor is signed in, as far as the page knows. The tokens themselves are
// httpOnly; the root layout reads the `ff_auth` flag cookie for the first value, and sign-in
// and sign-out flows update it with `setHasSession`.

export interface SessionState {
  hasSession: boolean
  setHasSession: (hasSession: boolean) => void
}

const SessionContext = createContext<SessionState | null>(null)

export function SessionProvider({
  initialHasSession,
  children,
}: {
  initialHasSession: boolean
  children: ReactNode
}) {
  const [hasSession, setHasSession] = useState(initialHasSession)
  // A server re-render (router.refresh()) brings a newer flag: it replaces the local value.
  const [serverValue, setServerValue] = useState(initialHasSession)
  if (serverValue !== initialHasSession) {
    setServerValue(initialHasSession)
    setHasSession(initialHasSession)
  }
  const value = useMemo(() => ({ hasSession, setHasSession }), [hasSession])
  return <SessionContext value={value}>{children}</SessionContext>
}

/** The session flag and its setter. Throws outside `SessionProvider` (the root providers). */
export function useSession(): SessionState {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession must be used inside SessionProvider')
  return session
}
