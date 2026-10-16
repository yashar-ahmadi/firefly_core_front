import Link from 'next/link'
import { categoryPath } from '@/features/catalog/listing-routes'
import type { FilterCategoryOption } from '@/lib/api/types/catalog'
import { toPersianDigits } from '@/lib/format'

export interface SubcategoryChipsProps {
  /** The category's own `path` («digital»): the options are its direct children. */
  parentPath: string
  /** `filters.categories` of the category: its children with their subtree counts. */
  options: readonly FilterCategoryOption[]
}

/**
 * The subcategories with products as links (product digest §6.1), each with its product count:
 * one scrolling row on phones, wrapped from md. Nothing when there is none (a leaf).
 */
export function SubcategoryChips({ parentPath, options }: SubcategoryChipsProps) {
  const shown = options.filter((option) => option.product_count > 0)
  if (shown.length === 0) return null
  return (
    <nav aria-label="زیردسته‌ها" className="mt-4 border-t border-ink-100 pt-3 md:pt-4">
      {/* The padding keeps the 44px hit areas and focus rings inside the scroller; on phones the
          far (left) end fades where more chips wait to be scrolled into view. */}
      <ul className="-mx-1 flex [scrollbar-width:none] gap-2 overflow-x-auto [mask-image:linear-gradient(to_right,transparent,#000_1.5rem)] p-1 pe-6 md:flex-wrap md:overflow-visible md:[mask-image:none] md:pe-1">
        {shown.map((option) => (
          <li key={option.id} className="shrink-0">
            <Link
              href={categoryPath(`${parentPath}/${option.slug}`)}
              className="relative inline-flex h-10 items-center gap-2 rounded-pill border border-ink-500 bg-white ps-4 pe-3 text-sm font-medium whitespace-nowrap text-ink-800 transition-colors duration-150 after:absolute after:inset-x-0 after:-inset-y-0.5 hover:border-brand hover:bg-brand-50 hover:text-brand-800"
            >
              {option.name}
              <span className="rounded-pill bg-ink-100 px-2 text-sm leading-6 text-ink-700">
                {toPersianDigits(option.product_count)}
                <span className="sr-only"> کالا</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
