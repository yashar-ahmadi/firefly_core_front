'use client'

import { useState } from 'react'
import { useSession } from '@/lib/session/session-context'
import { signInOpen } from '../login-methods'
import { useAuthSettings } from '../use-auth-settings'
import { AuthUnavailable } from './auth-card'
import { ForgotPasswordFlow } from './forgot-password-flow'
import { ReloadButton } from './reload-button'
import { SignedInPanel } from './signed-in-panel'

export interface ForgotPasswordScreenProps {
  /** A safe `?next=` path, or ''. */
  next: string
  /** The `?identifier=`, normalised ('' when it was not an email address or a mobile number). */
  initialIdentifier: string
}

/**
 * `/forgot-password/`: the recovery steps; for a visitor signed in already, a note saying so
 * (never a redirect: see SignedInPanel, whose «خروج» brings the form); without settings
 * (`disabledAuth()`), no code can be sent: said plainly.
 */
export function ForgotPasswordScreen({ next, initialIdentifier }: ForgotPasswordScreenProps) {
  const auth = useAuthSettings()
  const { hasSession } = useSession()
  const [arrivedSignedIn] = useState(hasSession)

  if (hasSession) return <SignedInPanel next={next} />
  if (!signInOpen(auth)) {
    return (
      <AuthUnavailable
        title="بازیابی رمز عبور"
        message="بازیابی رمز عبور در حال حاضر ممکن نیست. لطفاً چند دقیقه دیگر دوباره امتحان کنید."
        action={<ReloadButton />}
      />
    )
  }
  return (
    <ForgotPasswordFlow
      next={next}
      initialIdentifier={initialIdentifier}
      autoFocus={arrivedSignedIn}
    />
  )
}
