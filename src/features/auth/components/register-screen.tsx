'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useFeature } from '@/features/settings/feature-context'
import { useSession } from '@/lib/session/session-context'
import { loginPageHref } from '../auth-links'
import { useAuthSettings } from '../use-auth-settings'
import { AuthUnavailable } from './auth-card'
import { RegisterFlow } from './register-flow'
import { SignedInPanel } from './signed-in-panel'

/** The default sentence for the `registration` feature switched off without a reason. */
const SWITCHED_OFF = 'ثبت‌نام در حال حاضر غیرفعال است. لطفاً بعداً دوباره تلاش کنید.'
/** No method to register with (`registration_methods` empty, or no settings at all). */
const NO_METHOD = 'ثبت‌نام در حال حاضر ممکن نیست. لطفاً بعداً دوباره تلاش کنید.'

export interface RegisterScreenProps {
  /** A safe `?next=` path, or ''. */
  next: string
  /** The `?identifier=`, normalised ('' when it was not an email address or a mobile number). */
  initialIdentifier: string
  /** The operator's terms, sanitised on the server. */
  termsHtml: string | null
}

/**
 * `/register/`: the registration steps; for a visitor signed in already, a note saying so
 * (never a redirect: see SignedInPanel); and, while registration is closed (the `registration`
 * feature, or no `registration_methods`), why, with the way to login and no form. Once the
 * account is made, the steps stay on screen until the page changes.
 */
export function RegisterScreen({ next, initialIdentifier, termsHtml }: RegisterScreenProps) {
  const auth = useAuthSettings()
  const registration = useFeature('registration')
  const { hasSession } = useSession()
  const [arrivedSignedIn] = useState(hasSession)
  const [signingIn, setSigningIn] = useState(false)

  // Once signed in, the flow stays until the page changes, whatever the session flag says.
  if (hasSession && !signingIn) return <SignedInPanel next={next} />
  if (!signingIn && (!registration.enabled || auth.registration_methods.length === 0)) {
    return (
      <AuthUnavailable
        title="ثبت‌نام"
        message={registration.enabled ? NO_METHOD : (registration.reason ?? SWITCHED_OFF)}
        action={
          <Button asChild size="lg" fullWidth>
            <Link href={loginPageHref(undefined, next)}>ورود به حساب کاربری</Link>
          </Button>
        }
      />
    )
  }
  return (
    <RegisterFlow
      next={next}
      initialIdentifier={initialIdentifier}
      termsHtml={termsHtml}
      autoFocus={arrivedSignedIn}
      onSignedIn={() => setSigningIn(true)}
    />
  )
}
