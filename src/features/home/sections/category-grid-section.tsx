import Link from 'next/link'
import { CategoryThumb } from '@/components/layout/category-thumb'
import { categoryHref } from '@/components/layout/menu-tree'
import { cn } from '@/components/ui/cn'
import type { HomeSection } from '@/lib/api/types/catalog'
import { SectionShell } from './section-header'

/**
 * Phones: one row that scrolls sideways to the screen edges, snapping per tile, with 4.5 tiles
 * in view so the cut one shows there is more. From md: a centred grid that wraps.
 */
const LIST = cn(
  '-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pt-1 pb-2',
  '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
  'md:mx-0 md:grid md:snap-none md:grid-cols-[repeat(auto-fit,minmax(6.5rem,8rem))] md:justify-center md:gap-6 md:overflow-visible md:px-0',
)

const ITEM = 'w-[min(7rem,calc((100vw-1rem)/4.5-0.75rem))] shrink-0 snap-start md:w-auto'

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
      <ul className={LIST}>
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
