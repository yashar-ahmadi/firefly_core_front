'use client'

import { Check, Link2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { announce } from '@/components/ui/live-announcer'

// «کپی لینک این صفحه», for a payment shown to another account (the calm page's `forbidden`): the
// shopper opens the same address where they are not signed in (a private window) without having
// to find it in the address bar. Copied only on their press; the address holds the payment's uuid,
// a credential, so it is never sent anywhere else. Without a clipboard, the page says so.

const SHOWN_MS = 2_000

export function CopyPageLink() {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), SHOWN_MS)
    return () => clearTimeout(timer)
  }, [copied])

  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error('no clipboard')
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      announce('لینک این صفحه کپی شد.')
    } catch {
      announce('کپی نشد؛ لینک را از نوار نشانی مرورگر کپی کنید.')
    }
  }

  return (
    <Button
      variant="outline"
      iconStart={copied ? <Check aria-hidden /> : <Link2 aria-hidden />}
      onClick={() => void copy()}
    >
      {copied ? 'کپی شد' : 'کپی لینک این صفحه'}
    </Button>
  )
}
