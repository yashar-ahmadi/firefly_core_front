/** `GET homepage/` (content digest §2 and §6). Pure types. */
import type { PostCard } from '@/lib/api/types/blog'
import type { ProductCard } from '@/lib/api/types/catalog/product'
import type { OperatorLink } from '@/lib/api/types/display'
import type { CategoryCard } from '@/lib/api/types/settings'

/** One operator meta tag; `field` may repeat (two `og:image`), keep the order. */
export interface MetaTag {
  field: string
  value: string
}

/** `url` is a `/…` storefront path (may carry a query) or an http(s) URL; `title` may be "". */
export type HomeLink = OperatorLink

/** A slide or a banner. "" means none for the text fields. */
export interface HomeItem {
  id: number
  title: string
  description: string
  image: string
  /** null: use `image` on every size. */
  mobile_image: string | null
  /** CSS hex for title and description only; "" means the store default. */
  text_color: string
  alt: string
  /** null: not clickable. */
  link: HomeLink | null
}

/** A blog post card (also `GET blog/post/list/` and search): the blog's own type. */
export type { PostCard } from '@/lib/api/types/blog'

export interface HomeSectionHead {
  /** React key. */
  id: number
  /**
   * The operator's «سبک نمایش»: a `DisplayStyle` (`style_1` when none was picked), read through
   * `displayStyle()`, so a fifth one added later draws as `style_1`.
   */
  style: string
  /** "" means don't render. */
  title: string
  subtitle: string
  /** The operator's "see all"; it overrides the product carousel's `listing_query` link. */
  link: HomeLink | null
}

/** Every section carries all six content keys; the ones its type does not use are null. */
interface NoContent {
  items: null
  products: null
  listing_query: null
  categories: null
  posts: null
  content: null
}

export type HomeSection =
  | (HomeSectionHead & Omit<NoContent, 'items'> & { type: 'slider'; items: HomeItem[] })
  | (HomeSectionHead & Omit<NoContent, 'items'> & { type: 'banner_group'; items: HomeItem[] })
  | (HomeSectionHead &
      Omit<NoContent, 'products' | 'listing_query'> & {
        type: 'product_carousel'
        products: ProductCard[]
        /** Forward unchanged to `/product/list/?…`; null for a manual carousel. */
        listing_query: Record<string, string> | null
      })
  | (HomeSectionHead &
      Omit<NoContent, 'categories'> & { type: 'category_grid'; categories: CategoryCard[] })
  | (HomeSectionHead & Omit<NoContent, 'posts'> & { type: 'post_carousel'; posts: PostCard[] })
  | (HomeSectionHead &
      Omit<NoContent, 'content'> & {
        type: 'rich_text'
        /** Trusted HTML; never null for this type. */
        content: string
      })

export type HomeSectionType = HomeSection['type']

/** Never 404: an unconfigured store answers with empty SEO strings and no sections. */
export interface HomePage {
  page_title: string
  page_description: string
  /** "" when unset. */
  page_keywords: string
  /** null: canonical is `/`. */
  canonical_link: string | null
  meta_tags: MetaTag[]
  /** Operator order; already filtered by visibility. */
  sections: HomeSection[]
}
