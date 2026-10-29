import { MenuIcon } from '@/components/layout/menu-link'
import { cn } from '@/components/ui/cn'
import type { DisplayStyle } from '@/features/display/display-style'
import type { PageBlockItem } from '@/lib/api/types/page'
import { text } from './blocks'

// The `stats` block (content digest §2): big figures (`value`, as the operator wrote it, «۹۸٪»)
// with their labels (`title`) and an optional icon, in one of four styles. A description list:
// each label is its figure's term, the figure drawn above it.

export interface StatsBlockProps {
  items: PageBlockItem[]
  style: DisplayStyle
}

interface Look {
  list: string
  item: string
  value: string
  label: string
  icon: string
}

const LOOKS: Record<DisplayStyle, Look> = {
  // 1. A row of figures on one card, centred, a rule between them where they sit side by side.
  style_1: {
    list: 'grid grid-cols-2 gap-y-6 rounded-card bg-white px-3 py-6 shadow-card @2xl:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] @2xl:divide-x @2xl:divide-ink-100 @2xl:px-4',
    item: 'flex flex-col-reverse items-center gap-1 px-3 text-center',
    value: 'text-3xl leading-[3rem] font-black text-brand-700 @3xl:text-4xl @3xl:leading-[3.5rem]',
    label: 'text-sm leading-6 text-ink-600 @3xl:text-base',
    icon: 'mb-1 size-11 bg-brand-50',
  },
  // 2. A card per figure, its icon at the start.
  style_2: {
    list: 'grid grid-cols-1 gap-3 @md:grid-cols-2 @2xl:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]',
    item: 'relative flex min-h-24 flex-col-reverse justify-center gap-0.5 rounded-card bg-white p-4 shadow-card has-[[data-icon]]:ps-[4.75rem]',
    value: 'text-2xl leading-10 font-black text-ink-900',
    label: 'text-sm leading-6 text-ink-600',
    icon: 'absolute start-4 top-1/2 size-12 -translate-y-1/2 bg-brand-50',
  },
  // 3. A band in the brand's gradient, the figures in its text colour.
  style_3: {
    list: 'grid grid-cols-2 gap-y-6 rounded-card bg-linear-to-l from-brand-600 to-brand-800 px-3 py-8 text-brand-fg shadow-card @2xl:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] @2xl:px-6',
    item: 'flex flex-col-reverse items-center gap-1 px-3 text-center',
    value: 'text-3xl leading-[3rem] font-black @3xl:text-4xl @3xl:leading-[3.5rem]',
    label: 'text-sm leading-6 @3xl:text-base',
    icon: 'mb-1 size-11 bg-white/15 ring-1 ring-white/30',
  },
  // 4. Compact: the figures in a wrapping line, no card.
  style_4: {
    list: 'flex flex-wrap items-center gap-x-8 gap-y-3',
    item: 'flex flex-row-reverse items-baseline justify-end gap-2',
    value: 'text-xl leading-9 font-black text-brand-700',
    label: 'text-base leading-7 text-ink-700',
    icon: 'size-8 self-center bg-brand-50',
  },
}

/** The figures in one of four styles: a card's row, a card each, a brand band, a compact line. */
export function StatsBlock({ items, style }: StatsBlockProps) {
  const look = LOOKS[style]
  return (
    <dl className={look.list}>
      {items.map((item) => {
        const icon = text(item.icon)
        return (
          <div key={item.id} className={cn('min-w-0', look.item)}>
            <dt className={look.label}>{item.title}</dt>
            {/* The figure keeps its own direction («۲۵۰۰۰+» as written), the row the page's. */}
            <dd className={cn('tabular-nums', look.value)}>
              <bdi>{item.value}</bdi>
            </dd>
            {icon && (
              <dd
                aria-hidden
                data-icon=""
                className={cn('grid shrink-0 place-items-center rounded-full', look.icon)}
              >
                <MenuIcon src={icon} className="size-6" />
              </dd>
            )}
          </div>
        )
      })}
    </dl>
  )
}
