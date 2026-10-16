import type { ReactNode } from 'react'
import { CategoryThumb } from '@/components/layout/category-thumb'

export interface ListingHeroProps {
  /** The page's h1: the category, brand or list name. */
  title: string
  /** Plain text (a short description), never HTML. */
  description?: string | null
  /**
   * A category's picture (round) or a brand's logo (70px, square, never cut). The API's grey
   * placeholder, or a file that fails, shows the name's first letter instead.
   */
  image?: { src: string; kind: 'category' | 'logo' } | null
  /** Under the text, e.g. the subcategory chips. */
  children?: ReactNode
}

/**
 * The head of a listing page: a card with the picture at the start, the name (h1) and the short
 * description, and anything the page adds under them.
 */
export function ListingHero({ title, description, image, children }: ListingHeroProps) {
  const text = description?.trim()
  return (
    <div className="rounded-card bg-white p-4 shadow-card md:p-6">
      <div className="flex items-center gap-4 md:gap-5">
        {image &&
          (image.kind === 'logo' ? (
            <CategoryThumb
              category={{ name: title, image: image.src }}
              fit="contain"
              sizes="70px"
              className="size-[70px] rounded-control bg-white text-2xl"
            />
          ) : (
            <CategoryThumb
              category={{ name: title, image: image.src }}
              className="size-16 text-2xl md:size-20 md:text-3xl"
            />
          ))}
        <div className="min-w-0">
          <h1 className="text-xl leading-9 font-bold text-ink-900 md:text-2xl md:leading-10">
            {title}
          </h1>
          {text && <p className="mt-1 max-w-3xl text-base leading-7 text-ink-600">{text}</p>}
        </div>
      </div>
      {children}
    </div>
  )
}
