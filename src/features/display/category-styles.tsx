import Link from 'next/link'
import { CategoryThumb } from '@/components/layout/category-thumb'
import { isPlaceholderImage } from '@/components/layout/menu-tree'
import { cn } from '@/components/ui/cn'
import { SmartImage } from '@/components/ui/smart-image'
import { categoryPath } from '@/features/catalog/listing-routes'
import { BALANCED_GRID, balancedGridVars } from './balanced-grid'
import type { CategoryCard } from '@/lib/api/types/settings'

// A category grid's second to fourth styles (content digest §6.6); style 1 is the round tiles of
// CategoryGridSection. Each links to `/product-category/{path}/` (never the slug alone) and shows
// no product count (it covers direct products only: parents would read 0).

type Category = Pick<CategoryCard, 'id' | 'name' | 'path' | 'image' | 'icon'>

export interface CategoryStyleProps {
  categories: Category[]
}

/** Style 2, cards: a square picture on a white card and the name under it, in a wrapping grid. */
export function CategoryCards({ categories }: CategoryStyleProps) {
  return (
    <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 lg:gap-4 xl:grid-cols-8">
      {categories.map((category) => (
        <li key={category.id} className="min-w-0">
          <Link
            href={categoryPath(category.path)}
            prefetch={false}
            className="group flex h-full flex-col items-center gap-2 rounded-card bg-white p-2 text-center shadow-card transition-[box-shadow,transform] duration-200 hover:shadow-raised motion-safe:hover:-translate-y-0.5 sm:p-3"
          >
            <CategoryThumb
              category={category}
              sizes="(min-width: 1024px) 140px, 30vw"
              className="aspect-square w-full rounded-control text-3xl ring-0"
            />
            <span className="line-clamp-2 text-sm leading-6 font-medium text-ink-800 transition-colors group-hover:text-brand-700">
              {category.name}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/**
 * Style 3, chips: a pill per category with its small round picture and its name; one row that
 * scrolls sideways on phones, wrapping rows from md. The most categories in the least room.
 */
export function CategoryChips({ categories }: CategoryStyleProps) {
  return (
    <ul
      className={cn(
        '-mx-4 flex snap-x [scrollbar-width:none] gap-2 overflow-x-auto px-4 pt-1 pb-2 [&::-webkit-scrollbar]:hidden',
        'md:mx-0 md:flex-wrap md:overflow-visible md:px-0',
      )}
    >
      {categories.map((category) => (
        <li key={category.id} className="shrink-0 snap-start">
          <Link
            href={categoryPath(category.path)}
            prefetch={false}
            className="group flex h-12 items-center gap-2 rounded-pill bg-white ps-1.5 pe-4 shadow-card ring-1 ring-ink-200 transition-[box-shadow,color] duration-150 hover:ring-brand-300"
          >
            <CategoryThumb category={category} sizes="36px" className="size-9 text-base" />
            <span className="text-sm leading-6 font-medium whitespace-nowrap text-ink-800 transition-colors group-hover:text-brand-700">
              {category.name}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/**
 * Style 4, picture tiles: each category's picture filling a 4:3 tile, the name in white on a
 * dark fade at its foot (AA on any picture), two columns on phones, up to three, four and five
 * in even rows from md, lg and xl. A category with only the API's placeholder shows its first
 * letter on the brand's gradient.
 */
export function CategoryTiles({ categories }: CategoryStyleProps) {
  return (
    <ul
      className={cn('grid grid-cols-2 gap-3 lg:gap-4', BALANCED_GRID)}
      style={balancedGridVars(categories.length, { md: 3, lg: 4, xl: 5 })}
    >
      {categories.map((category) => {
        const src = [category.image, category.icon].find((url) => !isPlaceholderImage(url))
        return (
          <li key={category.id} className="min-w-0">
            <Link
              href={categoryPath(category.path)}
              prefetch={false}
              className="group relative isolate block aspect-[4/3] overflow-hidden rounded-card bg-linear-to-br from-brand-500 to-brand-800 shadow-card"
            >
              {src ? (
                <SmartImage
                  src={src}
                  alt=""
                  fill
                  sizes="(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
                  className="object-cover transition-transform duration-500 ease-out motion-safe:group-hover:scale-105"
                />
              ) : (
                <span
                  aria-hidden
                  className="absolute inset-0 grid place-items-center pb-8 text-5xl font-black text-white/90"
                >
                  {Array.from(category.name.trim())[0] ?? ''}
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 bg-linear-to-t from-ink-950/85 via-ink-950/55 to-transparent px-3 pt-8 pb-2.5">
                <span className="line-clamp-2 text-base leading-7 font-bold text-white">
                  {category.name}
                </span>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
