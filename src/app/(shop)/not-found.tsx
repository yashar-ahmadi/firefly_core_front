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
 * `notFound()` from a shop page: the 404 body inside the shop layout (header and footer stay).
 * Unknown URLs never get here; the root not-found.tsx handles them.
 */
export default function ShopNotFound() {
  return <NotFoundView />
}
