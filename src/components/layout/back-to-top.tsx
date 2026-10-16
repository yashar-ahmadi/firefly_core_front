'use client'

import { ArrowUp } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button-styles'
import { cn } from '@/components/ui/cn'
import { useT } from '@/lib/i18n/i18n-context'

/**
 * «بازگشت به بالا»: scrolls to the top (instantly under reduced motion) and moves keyboard focus
 * to the main content, so the next Tab continues from the top of the page, not the footer.
 */
export function BackToTop({ className }: { className?: string }) {
  const t = useT()
  return (
    <button
      type="button"
      onClick={() => {
        const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
        document.getElementById('main')?.focus({ preventScroll: true })
        window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })
      }}
      className={cn(buttonClasses({ variant: 'outline', size: 'sm' }), 'cursor-pointer', className)}
    >
      <ArrowUp aria-hidden />
      {t('back_to_top')}
    </button>
  )
}
