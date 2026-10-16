import Link from 'next/link'
import type { CSSProperties } from 'react'
import { CategoryThumb } from '@/components/layout/category-thumb'
import { categoryHref } from '@/components/layout/menu-tree'
import { cn } from '@/components/ui/cn'
import type { HomeSection } from '@/lib/api/types/catalog'
import { SectionShell } from './section-header'

/**
 * Phones: one row that scrolls sideways to the screen edges, snapping per tile, with 4.5 tiles
 * in view so the cut one shows there is more. From md: centred rows that wrap. The list is
 * narrowed to `--cols-*` tiles (see `balancedColumns`), so the rows come out even: seven
 * categories at 768px make 4 + 3, not 6 + 1. A tile and its gap are 7.5rem at md (6.5 + 1)
 * and 8.5rem from lg (7 + 1.5); the 1px absorbs rounding.
 */
const LIST = cn(
  '-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pt-1 pb-2',
  '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
  'md:mx-auto md:snap-none md:flex-wrap md:justify-center md:gap-x-4 md:gap-y-6 md:overflow-visible md:px-0 lg:gap-x-6',
  'md:max-w-[calc(var(--cols-md)*7.5rem_-_1rem_+_1px)] lg:max-w-[calc(var(--cols-lg)*8.5rem_-_1.5rem_+_1px)]',
  'xl:max-w-[calc(var(--cols-xl)*8.5rem_-_1.5rem_+_1px)]',
)

/**
 * The most tiles a row holds at the narrowest width of each breakpoint: 736px of content at
 * 768 (md), 976px at 1024 (lg) and 1232px at 1280 (xl).
 */
const ROW_CAPACITY = { md: 6, lg: 7, xl: 9 } as const

/** Tiles per row for `count` tiles in rows of at most `capacity`, as even as wrapping allows. */
export function balancedColumns(count: number, capacity: number): number {
  const rows = Math.max(1, Math.ceil(count / capacity))
  return Math.ceil(count / rows)
}

function columnVars(count: number): CSSProperties {
  return {
    '--cols-md': balancedColumns(count, ROW_CAPACITY.md),
    '--cols-lg': balancedColumns(count, ROW_CAPACITY.lg),
    '--cols-xl': balancedColumns(count, ROW_CAPACITY.xl),
  } as CSSProperties
}

const ITEM = 'w-[min(7rem,calc((100vw-1rem)/4.5-0.75rem))] shrink-0 snap-start md:w-26 lg:w-28'

export interface CategoryGridSectionProps {
  section: Extract<HomeSection, { type: 'category_grid' }>
  seeAllLabel: string
}

/**
 * Category tiles (content.md §6.6): a round picture (or the name's first letter when the API
 * only has its placeholder) and the name, linking to `/product-category/{path}/`. No product
 * counts: they cover direct products only, so parents would read 0.
 */
export function CategoryGridSection({ section, seeAllLabel }: CategoryGridSectionProps) {
  if (section.categories.length === 0) return null
  return (
    <SectionShell section={section} seeAllLabel={seeAllLabel}>
      <ul className={LIST} style={columnVars(section.categories.length)}>
        {section.categories.map((category) => (
          <li key={category.id} className={ITEM}>
            <Link
              href={categoryHref(category.path)}
              prefetch={false}
              className="group flex flex-col items-center gap-2 rounded-card p-1 text-center"
            >
              <CategoryThumb
                category={category}
                className="aspect-square w-full transition-shadow group-hover:shadow-raised md:w-24"
              />
              <span className="line-clamp-2 text-sm leading-6 font-medium text-ink-800 transition-colors group-hover:text-brand-700">
                {category.name}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </SectionShell>
  )
}
