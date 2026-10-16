'use client'

import { ChevronDown } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/components/ui/cn'
import { focusInView } from '@/components/ui/focus-in-view'

const MORE = 'ادامه\u{0654} مطلب'
const LESS = 'بستن'
/** The collapsed height (24rem); `max-h-96` below must match it. */
const COLLAPSED = 'max-h-96 overflow-hidden'

/**
 * Long content collapsed to 24rem behind «read more» (MORE). Collapsing is CSS only: the whole
 * content is in the server HTML (search engines read it) and stays in the page. The button
 * appears once the content is measured taller than the box; until then (and without script)
 * the box is simply 24rem high. Focus moving into the collapsed part (a link) opens it.
 */
export function ReadMore({ children }: { children: ReactNode }) {
  const id = useId()
  const boxRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [tall, setTall] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const box = boxRef.current
    if (!box || open) return
    const measure = () => setTall(box.scrollHeight > box.clientHeight + 1)
    measure()
    // Images and fonts arriving later change the height (where the browser can tell).
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(box)
    for (const child of box.children) observer.observe(child)
    return () => observer.disconnect()
  }, [open])

  const toggle = () => {
    setOpen(!open)
    // Collapsing a long text: keep the button (and the reader) where they were.
    if (open) requestAnimationFrame(() => focusInView(buttonRef.current))
  }

  return (
    <div>
      <div
        ref={boxRef}
        id={id}
        // The keyboard reaching a link in the collapsed part opens it: nothing focused is hidden.
        onFocus={() => {
          if (tall && !open) setOpen(true)
        }}
        className={cn(
          'relative',
          !open && COLLAPSED,
          // A fade over the last lines while collapsed.
          !open &&
            tall &&
            'after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-20 after:bg-linear-to-t after:from-white after:to-transparent',
        )}
      >
        {children}
      </div>
      {tall && (
        <Button
          ref={buttonRef}
          variant="link"
          aria-expanded={open}
          aria-controls={id}
          onClick={toggle}
          className="mt-2"
          iconEnd={
            <ChevronDown aria-hidden className={cn('transition-transform', open && 'rotate-180')} />
          }
        >
          {open ? LESS : MORE}
        </Button>
      )}
    </div>
  )
}
