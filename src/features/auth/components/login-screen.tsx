'use client'

import { useState } from 'react'
import { useSession } from '@/lib/session/session-context'
import { signInOpen } from '../login-methods'
import { useAuthSettings } from '../use-auth-settings'
import { AuthUnavailable } from './auth-card'
import { LoginFlow } from './login-flow'
import { ReloadButton } from './reload-button'
import { SignedInPanel } from './signed-in-panel'

export interface LoginScreenProps {
  /** The raw `?next=`. */
  next: string
  /** The raw `?identifier=`. */
  initialIdentifier: string
}

/** Without settings (`disabledAuth()`), no method can be offered: said plainly. */
function SignInClosed() {
  return (
    <AuthUnavailable
      title="ورود به حساب کاربری"
      message="ورود به حساب در حال حاضر ممکن نیست. لطفاً چند دقیقه دیگر دوباره امتحان کنید."
      action={<ReloadButton />}
    />
  )
}

/**
 * `/login/`: the login steps, or, for a visitor signed in already, a note saying so (never a
 * redirect: see SignedInPanel). Once a login succeeds, the steps stay on screen until the page
 * changes, although the session flag turns on meanwhile.
 */
export function LoginScreen({ next, initialIdentifier }: LoginScreenProps) {
  const auth = useAuthSettings()
  const { hasSession } = useSession()
  const [arrivedSignedIn] = useState(hasSession)
  const [signingIn, setSigningIn] = useState(false)

  if (hasSession && !signingIn) return <SignedInPanel next={next} />
  if (!signInOpen(auth)) return <SignInClosed />
  return (
    <LoginFlow
      next={next}
      initialIdentifier={initialIdentifier}
      autoFocus={arrivedSignedIn}
      onSignedIn={() => setSigningIn(true)}
    />
  )
}
