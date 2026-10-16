'use client'

import { WidgetBoundary } from '@/components/ui/widget-boundary'
import { MobileSearch } from '@/features/search/mobile-search'
import { PlainSearchForm } from '@/features/search/search-form'
import type { SearchFieldSize } from '@/features/search/search-field'
import { SuggestBox } from '@/features/search/suggest-box'

/**
 * The shop's search box, a GET form to `/search/?q=…` in every form (it works without JS):
 * - by default the suggest box (suggestions and recent searches under the field);
 * - `overlay` (the phone header, below md): a field that opens the full-screen search overlay.
 * A suggest box that fails to render leaves the plain form in its place (WidgetBoundary).
 */
export function HeaderSearchForm({
  size = 'lg',
  overlay = false,
  className,
  label,
  initialValue,
}: {
  /** `lg` is 48px (desktop and tablet), `md` 44px (phones). */
  size?: SearchFieldSize
  overlay?: boolean
  className?: string
  /** Names the `search` landmark of a form placed in a page (the header's is the other). */
  label?: string
  /** What the field starts with (the suggest box only). */
  initialValue?: string
}) {
  if (overlay) return <MobileSearch className={className} />
  const field = { size, className, label, initialValue }
  return (
    <WidgetBoundary name="search-box" fallback={<PlainSearchForm {...field} />}>
      <SuggestBox {...field} />
    </WidgetBoundary>
  )
}
