import type { Metadata } from 'next'
import { NotFoundView } from '@/components/layout/not-found-view'
import { notFoundMetadata } from '@/features/seo/not-found-metadata'

/**
 * The 404 title. A page that throws `notFound()` loses its own metadata: Next resolves the head
 * from the layouts plus the nearest not-found file's export (this one), so without it a missing
 * category would be titled like the home page.
 */
export function generateMetadata(): Promise<Metadata> {
  return notFoundMetadata()
}

/**
 * The shop's 404: `notFound()` from a shop page, and every unknown URL (the catch-all
 * `[...missing]/page.tsx`): the 404 body (search, the main categories) inside the shop layout,
 * whose header and footer stay. The root not-found.tsx is the light one, for 404s outside the
 * shop layout.
 */
export default function ShopNotFound() {
  return <NotFoundView />
}
