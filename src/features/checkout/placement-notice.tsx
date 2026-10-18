'use client'

import { CircleAlert } from 'lucide-react'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { buttonClasses } from '@/components/ui/button-styles'
import { Spinner } from '@/components/ui/spinner'
import { adjustmentText } from '@/features/cart/adjustments'
import { lineWarning } from '@/features/cart/line-warning'
import type { Cart, LineIssue } from '@/lib/api/types/cart'
import type { OrderItemUnavailable } from '@/lib/api/types/order'
import { formatNumber } from '@/lib/format'
import type { PlacementNotice } from './use-place-order'

// A refused placement, said (order digest §8.1): the API's sentence, the lines it named and how
// (an unavailable item, a quantity the stock no longer covers), the quantities a merge changed,
// and the way out (the cart, the orders awaiting payment, tracking). Something to try again here
// is busy while it runs (one run at a time) and says, politely, when it failed again.

/** What an unavailable item says: its cart line's own warning, else one for its issue. */
function itemWarning(item: OrderItemUnavailable, cart: Cart | undefined): string {
  const line = cart?.lines.find((candidate) => candidate.variant_id === item.variant_id)
  const own =
    line &&
    lineWarning({
      ...line,
      issue: item.issue as LineIssue,
      available_quantity: item.available_quantity,
    })
  if (own) return own
  if (item.issue === 'insufficient_stock') {
    return `موجودی کافی نیست؛ حداکثر ${formatNumber(item.available_quantity)} عدد.`
  }
  return item.issue === 'unavailable'
    ? 'این کالا در حال حاضر موجود نیست.'
    : 'تعداد این کالا را در سبد خرید اصلاح کنید.'
}

export function NoticeBox({ notice, cart }: { notice: PlacementNotice; cart?: Cart }) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-card bg-danger/10 px-4 py-3 text-base leading-7"
    >
      <p className="flex items-start gap-2 font-medium text-ink-900">
        <CircleAlert aria-hidden className="mt-1 size-5 shrink-0 text-danger" />
        <span>{notice.message}</span>
      </p>
      {notice.items && notice.items.length > 0 && (
        <ul className="ms-7 list-disc text-ink-800">
          {notice.items.map((item) => (
            <li key={item.variant_id} dir="auto">
              {`${item.product_name}: ${itemWarning(item, cart)}`}
            </li>
          ))}
        </ul>
      )}
      {notice.adjustments && notice.adjustments.length > 0 && (
        <p className="ms-7 text-ink-800">{notice.adjustments.map(adjustmentText).join(' ')}</p>
      )}
      {notice.retry && <RetryAction retry={notice.retry} />}
      {notice.link && (
        <Link
          href={notice.link.href}
          prefetch={false}
          className={buttonClasses({ variant: 'link' })}
        >
          {notice.link.label}
        </Link>
      )}
    </div>
  )
}

function RetryAction({ retry }: { retry: NonNullable<PlacementNotice['retry']> }) {
  const running = useRef(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const run = async () => {
    if (running.current) return
    running.current = true
    setBusy(true)
    setFailed(false)
    const done = await retry.run().catch(() => false)
    running.current = false
    setBusy(false)
    setFailed(!done)
  }
  return (
    <>
      {/* Busy, it stays focusable (aria-disabled): the focus is still there when it answers. */}
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        aria-disabled={busy || undefined}
        aria-busy={busy || undefined}
        iconStart={busy ? <Spinner size="sm" /> : undefined}
        onClick={run}
      >
        {retry.label}
      </Button>
      <p role="status" className="text-sm leading-6 text-ink-700">
        {failed ? retry.failedAgain : ''}
      </p>
    </>
  )
}
