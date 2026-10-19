import { VisuallyHidden } from '@/components/ui/visually-hidden'
import { formatNumber } from '@/lib/format/number'

/**
 * A comment tab's count, for every comment section of the shop (a post's, a page's): a badge for
 * the eye, and the count in words for a screen reader, so the tab is named «دیدگاه‌ها، ۲ دیدگاه»
 * rather than the badge glued to its label («دیدگاه‌ها۲»). `unit` is what is counted, singular
 * («دیدگاه», «پرسش»).
 */
export function TabCount({ value, unit }: { value: number; unit: string }) {
  const count = formatNumber(value)
  return (
    <>
      <span
        aria-hidden
        className="min-w-6 rounded-pill bg-ink-100 px-1.5 text-center text-sm leading-6 text-ink-700"
      >
        {count}
      </span>
      <VisuallyHidden>{`، ${count} ${unit}`}</VisuallyHidden>
    </>
  )
}
