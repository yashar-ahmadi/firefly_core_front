'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { cn } from '@/components/ui/cn'

/**
 * The visitor's text as plain text (React escapes it), its line breaks kept. Long text is cut to
 * four lines by CSS alone (the whole text stays in the page: find in page and screen readers get
 * all of it), with «بیشتر» to open it and «کمتر» to cut it again; the button shows only when
 * the text is longer than the cut, measured again as the width changes.
 */
export function ClampedText({ text, className }: { text: string; className?: string }) {
  const id = useId()
  const box = useRef<HTMLParagraphElement>(null)
  const [open, setOpen] = useState(false)
  const [overflows, setOverflows] = useState(false)

  useEffect(() => {
    const element = box.current
    if (!element || open) return
    const measure = () => setOverflows(element.scrollHeight > element.clientHeight + 1)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [text, open])

  return (
    <div className={cn('flex flex-col items-start gap-1', className)}>
      <p
        ref={box}
        id={id}
        className={cn(
          'text-base leading-8 break-words whitespace-pre-line text-ink-800',
          !open && 'line-clamp-4',
        )}
      >
        {text}
      </p>
      {(overflows || open) && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((value) => !value)}
          className="-mx-2 inline-flex min-h-11 items-center rounded-control px-2 text-base font-medium text-brand-700 hover:text-brand-800 hover:underline"
        >
          {open ? 'کمتر' : 'بیشتر'}
        </button>
      )}
    </div>
  )
}
