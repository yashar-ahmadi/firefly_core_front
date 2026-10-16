import { queryOptions, useQuery } from '@tanstack/react-query'
import { bffFetch } from '@/lib/api/client'
import type { ProductDetail } from '@/lib/api/types/catalog'

// The product payload in the browser (quick view, the compare page): `GET product/detail/<slug>/`
// through the BFF, one query per product shared by both, so a product seen in one is instant
// in the other.

/** The query of one product's payload. Its comment lists live under it (`commentsKey`). */
export const productKey = (slug: string) => ['product', slug] as const

export function productDetailQuery(slug: string) {
  return queryOptions({
    queryKey: productKey(slug),
    queryFn: async ({ signal }) =>
      (await bffFetch<ProductDetail>(`product/detail/${slug}/`, { signal })).data,
  })
}

/** A product's payload; an unknown or unpublished slug fails with the API's 404. */
export function useProductDetail(slug: string) {
  return useQuery(productDetailQuery(slug))
}
