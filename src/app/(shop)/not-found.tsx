import { NotFoundView } from '@/components/layout/not-found-view'

/**
 * `notFound()` from a shop page: the 404 body inside the shop layout (header and footer stay).
 * Unknown URLs never get here; the root not-found.tsx handles them.
 */
export default function ShopNotFound() {
  return <NotFoundView />
}
