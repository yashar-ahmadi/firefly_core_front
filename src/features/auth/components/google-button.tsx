'use client'

import Script from 'next/script'
import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/components/ui/cn'
import { OrDivider } from './auth-card'
import { useSubmitWait } from './code-timers'
import type { Wait } from './login-types'

// «ورود با گوگل» through Google Identity Services (auth digest F4). Its script is loaded by this
// component alone, so only the login page, and only while the settings turn Google on, ever
// requests it. When it cannot load (blocked, offline) the button and its «یا» are not shown.

const GIS_SRC = 'https://accounts.google.com/gsi/client'
/** The widest button GIS draws. */
const MAX_WIDTH = 400

interface GsiCredentialResponse {
  /** The ID token (a JWT) for `POST account/auth/google/ {id_token}`. */
  credential: string
}

/** The part of `google.accounts.id` used here. */
interface GoogleIdentity {
  initialize(config: {
    client_id: string
    callback: (response: GsiCredentialResponse) => void
    ux_mode?: 'popup' | 'redirect'
    context?: 'signin' | 'signup' | 'use'
  }): void
  renderButton(
    parent: HTMLElement,
    options: {
      type: 'standard'
      theme: 'outline'
      size: 'large'
      text: 'continue_with'
      shape: 'rectangular'
      logo_alignment: 'center'
      width: number
      locale: string
    },
  ): void
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdentity } }
  }
}

export interface GoogleButtonProps {
  clientId: string
  /** Called with the GIS credential (an ID token). */
  onCredential: (idToken: string) => void
  /** A 429's wait: the button cannot be used until it ends. */
  wait: Wait
}

/** Each GIS object initialised so far, with its client id: once per page load and id. */
const initialised = new WeakMap<GoogleIdentity, string>()
/** The button on screen: GIS calls the one callback it was initialised with, which asks this. */
let receiver: ((idToken: string) => void) | null = null

/** Google's own button, then «یا»; nothing at all once the script is known to be unusable. */
export function GoogleButton({ clientId, onCredential, wait }: GoogleButtonProps) {
  const [failed, setFailed] = useState(false)
  const slot = useRef<HTMLDivElement>(null)
  const lock = useSubmitWait(wait)
  // The latest handler of the latest button drawn (the step can be left and shown again).
  const latest = useRef(onCredential)
  useEffect(() => {
    latest.current = onCredential
  })
  useEffect(() => {
    const own = (idToken: string) => latest.current(idToken)
    receiver = own
    return () => {
      if (receiver === own) receiver = null
    }
  }, [])

  const draw = useCallback(() => {
    const identity = window.google?.accounts?.id
    const parent = slot.current
    if (!identity || !parent) return setFailed(true)
    try {
      if (initialised.get(identity) !== clientId) {
        identity.initialize({
          client_id: clientId,
          callback: ({ credential }) => receiver?.(credential),
          ux_mode: 'popup',
          context: 'signin',
        })
        initialised.set(identity, clientId)
      }
      identity.renderButton(parent, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        logo_alignment: 'center',
        width: Math.min(MAX_WIDTH, parent.clientWidth || MAX_WIDTH),
        locale: 'fa',
      })
    } catch {
      setFailed(true)
    }
  }, [clientId])
  const fail = useCallback(() => setFailed(true), [])

  if (failed) return null
  return (
    <>
      <Script src={GIS_SRC} strategy="afterInteractive" onReady={draw} onError={fail} />
      {/* The button's height is kept while it loads, so the form below does not move. While a
          429's wait runs it is out of reach (inert: no pointer, no focus) and dimmed. */}
      <div
        ref={slot}
        inert={lock.locked}
        className={cn('flex min-h-11 w-full justify-center', lock.locked && 'opacity-50')}
      />
      {lock.note}
      <OrDivider />
    </>
  )
}
