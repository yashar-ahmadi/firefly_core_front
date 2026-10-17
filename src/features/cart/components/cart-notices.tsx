'use client'

import { Info, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { IconButton } from '@/components/ui/icon-button'
import { announce } from '@/components/ui/live-announcer'
import type { Cart } from '@/lib/api/types/cart'
import { adjustmentText } from '../adjustments'
import { focusCartHeading } from '../cart-heading'
import { detachedCouponText } from '../coupon-messages'
import { lineWarning } from '../line-warning'

interface Notice {
  /** Stable for what it says: a dismissed notice is not shown again for it. */
  key: string
  text: string
}

/** What a cart says once (cart digest §0.8): lowered or dropped lines, a coupon taken off. */
function onceOnly(cart: Cart): Notice[] {
  const notices = cart.adjustments.map((adjustment) => ({
    key: `adjustment:${adjustment.variant_id}:${adjustment.requested}:${adjustment.applied}`,
    text: adjustmentText(adjustment),
  }))
  const { code, detached_reason: reason } = cart.coupon
  if (reason)
    notices.push({ key: `coupon:${code}:${reason}`, text: detachedCouponText(code, reason) })
  return notices
}

/** What the cart says while it lasts: each line that cannot be ordered as it is. */
function lineIssues(cart: Cart): Notice[] {
  return cart.lines.flatMap((line) => {
    const warning = lineWarning(line)
    if (!warning) return []
    return [
      {
        key: `line:${line.variant_id}:${line.issue ?? 'out'}`,
        text: `«${line.product_name}»: ${warning}`,
      },
    ]
  })
}

/**
 * The cart's notices, as dismissible messages above the lines: the once-only `adjustments` and a
 * coupon's `detached_reason` stay until dismissed, whatever the next answer says; a line's
 * issue stays while the API reports it (dismissed, it stays away until the issue changes). Each
 * new notice is read out politely (the shell's live region).
 */
export function CartNotices({ cart }: { cart: Cart }) {
  const [kept, setKept] = useState<Notice[]>([])
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set())
  const [seen, setSeen] = useState<Cart | null>(null)
  if (seen !== cart) {
    setSeen(cart)
    const fresh = onceOnly(cart).filter(
      (notice) => !kept.some((other) => other.key === notice.key) && !dismissed.has(notice.key),
    )
    if (fresh.length > 0) setKept([...kept, ...fresh])
  }
  const notices = [...kept, ...lineIssues(cart)].filter((notice) => !dismissed.has(notice.key))

  // A dismissed notice took its button (and the focus) with it: the notice now in its place
  // takes the focus, else the one before, else the page's heading.
  const section = useRef<HTMLElement>(null)
  const focusAt = useRef<number | null>(null)
  useEffect(() => {
    const index = focusAt.current
    if (index === null) return
    focusAt.current = null
    const buttons = section.current?.querySelectorAll<HTMLElement>('[data-notice-dismiss]') ?? []
    const next = buttons[Math.min(index, buttons.length - 1)]
    if (next) next.focus()
    else focusCartHeading()
  })

  // Each notice is read out once, when it first appears.
  const spoken = useRef(new Set<string>())
  useEffect(() => {
    const unheard = notices.filter((notice) => !spoken.current.has(notice.key))
    if (unheard.length === 0) return
    for (const notice of unheard) spoken.current.add(notice.key)
    announce(unheard.map((notice) => notice.text).join(' '))
  })

  if (notices.length === 0) return null
  return (
    <section ref={section} aria-label={'پیام\u{200C}های سبد خرید'} className="flex flex-col gap-2">
      {notices.map((notice, index) => (
        <div
          key={notice.key}
          className="flex items-start gap-2 rounded-card bg-warning/10 py-1 ps-4 pe-1 text-base text-ink-800"
        >
          <Info aria-hidden className="mt-3 size-5 shrink-0 text-warning" />
          <p className="min-w-0 flex-1 py-2 leading-7">{notice.text}</p>
          <IconButton
            label="بستن پیام"
            icon={<X />}
            data-notice-dismiss=""
            onClick={() => {
              focusAt.current = index
              setDismissed(new Set(dismissed).add(notice.key))
            }}
            className="shrink-0 text-ink-600"
          />
        </div>
      ))}
    </section>
  )
}
