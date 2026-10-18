'use client'

import Link from 'next/link'
import { announce } from '@/components/ui/live-announcer'
import { buttonClasses } from '@/components/ui/button-styles'
import { cn } from '@/components/ui/cn'
import { notify, toastRegionReady } from '@/components/ui/toaster'
import type { ReorderNotice } from './reorder-copy'

// The toast of «خرید دوباره»: what went into the cart and what did not, and «مشاهدهٔ سبد خرید»
// (a link: the cart page). One at a time: a new one replaces the last. Read out once (by the
// toaster's region when it is on the page, else by the shell's).

const TOAST_ID = 'reorder'
const VIEW_CART = 'مشاهده\u{0654} سبد خرید'

export function ReorderToast({
  notice,
  onNavigate,
}: {
  notice: ReorderNotice
  onNavigate?: () => void
}) {
  return (
    <div className="flex flex-col gap-1 font-normal">
      <p className="font-semibold">{notice.title}</p>
      {notice.lines.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-sm leading-6 text-ink-700">
          {notice.lines.map((line) => (
            <li key={line} dir="auto">
              {line}
            </li>
          ))}
        </ul>
      )}
      <Link
        href="/cart/"
        prefetch={false}
        onClick={onNavigate}
        className={cn(buttonClasses({ variant: 'link', size: 'sm' }), 'self-start')}
      >
        {VIEW_CART}
      </Link>
    </div>
  )
}

export function showReorderToast(notice: ReorderNotice): void {
  const heard = toastRegionReady()
  notify[notice.tone](
    <ReorderToast notice={notice} onNavigate={() => notify.dismiss(TOAST_ID)} />,
    { id: TOAST_ID },
  )
  if (!heard) announce([notice.title, ...notice.lines].join(' '))
}
