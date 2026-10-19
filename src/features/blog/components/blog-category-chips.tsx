import Link from 'next/link'
import { cn } from '@/components/ui/cn'
import { blogCategoryPath } from '@/features/blog/blog-routes'
import type { BlogCategoryListItem } from '@/lib/api/types/blog'

/**
 * Blog categories as a row of chip links (the home: the top level; a category page: its
 * children): one scrolling row on phones, wrapped from md. Nothing when there is none.
 */
export function BlogCategoryChips({
  categories,
  label,
  className,
}: {
  categories: readonly BlogCategoryListItem[]
  label: string
  className?: string
}) {
  if (categories.length === 0) return null
  return (
    <nav aria-label={label} className={cn('min-w-0', className)}>
      {/* The padding keeps the 44px hit areas and focus rings inside the scroller; on phones the
          far (left) end fades where more chips wait to be scrolled into view. */}
      <ul className="-mx-1 flex [scrollbar-width:none] gap-2 overflow-x-auto [mask-image:linear-gradient(to_right,transparent,#000_1.5rem)] p-1 pe-6 md:flex-wrap md:overflow-visible md:[mask-image:none] md:pe-1">
        {categories.map((category) => (
          <li key={category.id} className="shrink-0">
            <Link
              href={blogCategoryPath(category.path)}
              className="relative inline-flex h-10 items-center rounded-pill border border-ink-300 bg-white px-4 text-sm font-medium whitespace-nowrap text-ink-800 transition-colors duration-150 after:absolute after:inset-x-0 after:-inset-y-0.5 hover:border-brand hover:bg-brand-50 hover:text-brand-800"
            >
              {category.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
