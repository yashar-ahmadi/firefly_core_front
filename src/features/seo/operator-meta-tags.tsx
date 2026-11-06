import { propertyMetaTags } from '@/features/seo/page-metadata'
import type { MetaTag } from '@/lib/api/types/catalog'

/**
 * The operator's `property=` meta rows (`og:`, `article:`…) of a page's `meta_tags`, in order:
 * Next's metadata can only write `name=` (those go through `pageMetadata`'s `other`), so the page
 * renders these and React hoists them into <head>. A Server Component: no client JavaScript.
 */
export function OperatorMetaTags({ tags }: { tags: readonly MetaTag[] | undefined }) {
  // An API older than the rows on catalog and blog details (M-13) sends none.
  return propertyMetaTags(tags ?? []).map((tag, index) => (
    <meta key={`${tag.field}-${index}`} property={tag.field.trim()} content={tag.value} />
  ))
}
