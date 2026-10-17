'use client'

import Script from 'next/script'
import { useCallback, useEffect, useRef, useState } from 'react'
import { OrDivider } from './auth-card'

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
}

/** Google's own button, then «یا»; nothing at all once the script is known to be unusable. */
export function GoogleButton({ clientId, onCredential }: GoogleButtonProps) {
  const [failed, setFailed] = useState(false)
  const slot = useRef<HTMLDivElement>(null)
  // GIS keeps the first callback it is given: it calls the latest handler through this.
  const latest = useRef(onCredential)
  useEffect(() => {
    latest.current = onCredential
  })

  const draw = useCallback(() => {
    const identity = window.google?.accounts?.id
    const parent = slot.current
    if (!identity || !parent) return setFailed(true)
    try {
      identity.initialize({
        client_id: clientId,
        callback: ({ credential }) => latest.current(credential),
        ux_mode: 'popup',
        context: 'signin',
      })
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
      {/* The button's height is kept while it loads, so the form below does not move. */}
      <div ref={slot} className="flex min-h-11 w-full justify-center" />
      <OrDivider />
    </>
  )
}
