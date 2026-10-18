'use client'

import { Check, Copy } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { announce } from '@/components/ui/live-announcer'

// One copyable value of a shop card (its number, sheba, account number): its label with the copy
// button beside it, then the value on a line of its own (it never has to share its width, so it
// wraps only between its groups on the narrowest phones), shown as given (`children`, left to
// right) and copied as `value` (the digits alone, no dashes or spaces). The button names what it
// copies («کپی شماره کارت بانک ملت»), and the result is said politely and shown on the button for
// a moment. Without a clipboard (an insecure origin, a refusal) the value is selected for the
// shopper to copy.

const SHOWN_MS = 2_000

export interface CopyValueProps {
  /** «شماره کارت». */
  label: string
  value: string
  /** What it is, for the button's name and the message: «شماره کارت بانک ملت». */
  what: string
  children: ReactNode
  /** The number of the card itself: larger. */
  large?: boolean
}

export function CopyValue({ label, value, what, children, large = false }: CopyValueProps) {
  const shown = useRef<HTMLElement>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), SHOWN_MS)
    return () => clearTimeout(timer)
  }, [copied])

  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error('no clipboard')
      await navigator.clipboard.writeText(value)
      setCopied(true)
      announce(`${what} کپی شد.`)
    } catch {
      const selection = window.getSelection()
      if (shown.current && selection) selection.selectAllChildren(shown.current)
      announce(`${what} انتخاب شد؛ آن را کپی کنید.`)
    }
  }

  return (
    <div className="flex flex-col gap-0.5 border-t border-ink-100 pt-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm leading-6 text-ink-600">{label}</span>
        <Button
          variant="ghost"
          size="sm"
          iconStart={copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          onClick={() => void copy()}
        >
          {copied ? 'کپی شد' : 'کپی'} <span className="sr-only">{what}</span>
        </Button>
      </div>
      <bdi
        ref={shown}
        dir="ltr"
        className={
          large
            ? 'self-start text-lg font-bold tracking-wide text-ink-900 tabular-nums select-all md:text-xl'
            : 'self-start text-base font-medium text-ink-900 tabular-nums select-all'
        }
      >
        {children}
      </bdi>
    </div>
  )
}
