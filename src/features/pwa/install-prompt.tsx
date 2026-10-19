'use client'

import { Share, Smartphone } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useEffect, useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { forgetOffer, installOffer, rememberDismissal } from './install-offer'
import { INSTALLABLE_EVENT, NO_PROMPT_PATH } from './install-state'

// The install prompt (Plan 5 Task 6), loaded by the gate only where it may show
// (install-prompt-gate.tsx). Chromium makes an install offer (`beforeinstallprompt`, kept by the
// registration script, which keeps its own banner from showing): «نصب» opens the browser's
// dialog. Safari on an iPhone makes none: the banner says how to add the shop to the home screen.
// Any other browser gets nothing. Dismissed, answered or installed, it never comes back. Never on
// the visitor's own pages (`NO_PROMPT_PATH`) the visitor goes to from here.

type Mode = 'prompt' | 'ios'

/** Safari on an iPhone (another iOS browser's menu differs: no instructions there). */
const isIphoneSafari = (agent: string) =>
  /iPhone|iPod/.test(agent) && /Safari\//.test(agent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(agent)

const currentMode = (): Mode | null =>
  isIphoneSafari(navigator.userAgent) ? 'ios' : installOffer() ? 'prompt' : null

export function InstallPrompt({ name }: { name: string }) {
  const pathname = usePathname() ?? '/'
  const [mode, setMode] = useState<Mode | null>(currentMode)
  const [closed, setClosed] = useState(false)
  const titleId = useId()

  useEffect(() => {
    const offered = () => setMode(currentMode)
    const installed = () => {
      rememberDismissal()
      setClosed(true)
    }
    window.addEventListener(INSTALLABLE_EVENT, offered)
    window.addEventListener('appinstalled', installed)
    return () => {
      window.removeEventListener(INSTALLABLE_EVENT, offered)
      window.removeEventListener('appinstalled', installed)
    }
  }, [])

  if (closed || mode === null || NO_PROMPT_PATH.test(pathname)) return null

  const close = () => {
    rememberDismissal()
    setClosed(true)
  }
  const install = () => {
    const offer = installOffer()
    // An offer opens the dialog once, within the press; whatever the answer, it is not asked again.
    forgetOffer()
    offer?.prompt().catch(() => undefined)
    close()
  }

  return (
    <section
      aria-labelledby={titleId}
      data-install-prompt=""
      className="fixed inset-x-0 bottom-[calc(var(--bottom-bar-room)+0.5rem)] z-[36] px-3 md:hidden"
    >
      <div className="mx-auto flex max-w-xl items-start gap-3 rounded-card border border-ink-200 bg-white p-3 shadow-raised">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <Smartphone aria-hidden className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-base leading-7 font-bold text-ink-900">
            نصب برنامهٔ {name}
          </h2>
          {mode === 'prompt' ? (
            <p className="mt-1 text-sm leading-6 text-ink-600">
              فروشگاه را مثل یک برنامه از صفحهٔ اصلی گوشی باز کنید.
            </p>
          ) : (
            <p className="mt-1 text-sm leading-6 text-ink-600">
              در Safari دکمهٔ اشتراک‌گذاری{' '}
              <Share aria-hidden className="inline size-4 align-[-0.15em] text-brand-700" /> را
              بزنید و «
              <span dir="ltr" className="whitespace-nowrap">
                Add to Home Screen
              </span>
              » را انتخاب کنید.
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {mode === 'prompt' ? (
              <>
                <Button type="button" onClick={install}>
                  نصب
                </Button>
                <Button type="button" variant="ghost" onClick={close}>
                  بعداً
                </Button>
              </>
            ) : (
              <Button type="button" variant="outline" onClick={close}>
                متوجه شدم
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
