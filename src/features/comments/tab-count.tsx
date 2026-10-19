import { formatNumber } from '@/lib/format/number'

// A comment tab's count, for every comment section of the shop (a post's, a page's): a badge for
// the eye, and the tab's name for a screen reader with the count in words, so it is named
// «دیدگاه‌ها (۲ دیدگاه)» rather than the badge glued to its label («دیدگاه‌ها۲»).

/**
 * The tab's accessible name (its `aria-label`): the visible label, then the count and what is
 * counted (`unit`, singular: «دیدگاه», «پرسش»). Given whole, so every browser says the same (the
 * name computed from the tab's flex items would get a space before the count in some, not in
 * others); it holds the visible words, as a name must (WCAG 2.5.3).
 */
export function countedTabName(label: string, value: number, unit: string): string {
  return `${label} (${formatNumber(value)} ${unit})`
}

/** The badge beside a tab's label, for the eye only: the tab's name says the count. */
export function TabCount({ value }: { value: number }) {
  return (
    <span
      aria-hidden
      className="min-w-6 rounded-pill bg-ink-100 px-1.5 text-center text-sm leading-6 text-ink-700"
    >
      {formatNumber(value)}
    </span>
  )
}
