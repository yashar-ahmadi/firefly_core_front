'use client'

import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { IconButton } from '@/components/ui/icon-button'
import { announce } from '@/components/ui/live-announcer'
import { toPersianDigits } from '@/lib/format'

// «کپی کد سفارش» beside an order's code (the shopper's key to support and tracking: 10 digits,
// copied as they are). Said once; without a clipboard, the shopper is told to select it.

const SHOWN_MS = 2_000

export function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), SHOWN_MS)
    return () => clearTimeout(timer)
  }, [copied])

  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error('no clipboard')
      await navigator.clipboard.writeText(code)
      setCopied(true)
      announce('کد سفارش کپی شد.')
    } catch {
      announce('کپی نشد؛ کد سفارش را انتخاب و کپی کنید.')
    }
  }

  return (
    <IconButton
      label={`کپی کد سفارش ${toPersianDigits(code)}`}
      icon={copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      onClick={() => void copy()}
    />
  )
}
