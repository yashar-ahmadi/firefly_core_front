'use client'

import { Share2 } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import { overlayButtonClasses, overlayChipClasses } from '@/components/ui/overlay-button-styles'
import { notify } from '@/components/ui/toaster'

const LABEL = 'اشتراک\u{200C}گذاری'
const COPIED = 'پیوند کالا کپی شد.'
const NOT_COPIED = 'کپی پیوند انجام نشد. نشانی صفحه را از نوار مرورگر کپی کنید.'

/** The shopper closed the share sheet: nothing else to do. */
function isCancel(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

async function shareOrCopy(title: string, url: string): Promise<void> {
  const data = { title, url }
  if (typeof navigator.share === 'function' && (navigator.canShare?.(data) ?? true)) {
    try {
      await navigator.share(data)
      return
    } catch (error) {
      if (isCancel(error)) return
      // Refused (no user activation, a policy): copying still works.
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    notify.success(COPIED)
  } catch {
    notify.error(NOT_COPIED)
  }
}

export interface ShareButtonProps {
  title: string
  /** The page's path (with `?variant=`), resolved on this origin when pressed. */
  path: string
  className?: string
}

/**
 * Shares the page: the system share sheet where there is one (phones), else the link is copied
 * with a toast. A 44px round button like the wishlist heart beside it.
 */
export function ShareButton({ title, path, className }: ShareButtonProps) {
  return (
    <button
      type="button"
      aria-label={LABEL}
      onClick={() => void shareOrCopy(title, new URL(path, window.location.origin).href)}
      className={cn(overlayButtonClasses('md'), className)}
    >
      <span className={overlayChipClasses('md')}>
        <Share2 aria-hidden />
      </span>
    </button>
  )
}
