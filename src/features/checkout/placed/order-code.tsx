'use client'

import { Copy } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { announce } from '@/components/ui/live-announcer'
import { toPersianDigits } from '@/lib/format'

// The order code (10 digits, may start with 0: a string, order digest §1.3), the shopper's key to
// tracking and support: left to right, copied whole with «کپی». Without a clipboard (an insecure
// origin, a refusal) the code is selected for the shopper to copy.

const COPIED = 'کد سفارش کپی شد.'
const SELECTED = 'کد سفارش انتخاب شد؛ آن را کپی کنید.'

export function OrderCode({ code }: { code: string }) {
  const value = useRef<HTMLElement>(null)
  const [result, setResult] = useState<string | null>(null)

  async function copy() {
    let message = COPIED
    try {
      if (!navigator.clipboard) throw new Error('no clipboard')
      await navigator.clipboard.writeText(code)
    } catch {
      const selection = window.getSelection()
      if (value.current && selection) selection.selectAllChildren(value.current)
      message = SELECTED
    }
    setResult(message)
    announce(message)
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base leading-7 text-ink-700">
      <span>کد سفارش:</span>
      <bdi
        ref={value}
        dir="ltr"
        data-order-code={code}
        className="rounded-control bg-ink-50 px-3 py-1 font-bold tracking-wider text-ink-900 tabular-nums select-all"
      >
        {toPersianDigits(code)}
      </bdi>
      <Button variant="ghost" size="sm" iconStart={<Copy aria-hidden />} onClick={copy}>
        کپی <span className="sr-only">کد سفارش</span>
      </Button>
      {result && <span className="basis-full text-sm leading-6 text-ink-600">{result}</span>}
    </div>
  )
}
