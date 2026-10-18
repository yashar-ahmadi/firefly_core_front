'use client'

import { Check, Copy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { announce } from '@/components/ui/live-announcer'
import { toPersianDigits } from '@/lib/format'

// A parcel's postal tracking code (order digest §6.1 `sent`: `postal_tracking_code`): shown left
// to right in Persian digits, copied as it is (the carrier's site wants its own digits), with a
// hint of where to use it. Without a clipboard the code is selected for the shopper to copy. The
// carrier is not named here: tracking does not say it (the account's order shows the shipping
// method beside it).

const SHOWN_MS = 2_000

export function TrackingCode({ code, hint = true }: { code: string; hint?: boolean }) {
  const value = useRef<HTMLElement>(null)
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
      announce('کد رهگیری مرسوله کپی شد.')
    } catch {
      const selection = window.getSelection()
      if (value.current && selection) selection.selectAllChildren(value.current)
      announce('کد رهگیری مرسوله انتخاب شد؛ آن را کپی کنید.')
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-card border border-ink-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-base leading-7 font-medium text-ink-800">کد رهگیری مرسوله</span>
        <Button
          variant="ghost"
          size="sm"
          iconStart={copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          onClick={() => void copy()}
        >
          {copied ? 'کپی شد' : 'کپی'} <span className="sr-only">کد رهگیری مرسوله</span>
        </Button>
      </div>
      <bdi
        ref={value}
        dir="ltr"
        className="self-start text-base font-bold break-all text-ink-900 tabular-nums select-all sm:text-lg sm:tracking-wide"
      >
        {toPersianDigits(code)}
      </bdi>
      {hint && (
        <p className="text-sm leading-6 text-ink-600">
          این کد را در سامانهٔ رهگیری شرکتی که مرسوله را می‌رساند (مانند پست) وارد کنید تا جای
          مرسوله را ببینید.
        </p>
      )}
    </div>
  )
}
