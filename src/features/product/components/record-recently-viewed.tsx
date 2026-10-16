'use client'

import { useEffect, useEffectEvent } from 'react'
import { useRecentlyViewed } from '@/features/recently-viewed/store'
import { cardFromDetail } from '../card-from-detail'
import { useProduct } from './product-provider'

/**
 * Puts the product at the front of the visitor's recently viewed list (on this device), once per
 * product page visit: a refreshed payload of the same product is not a new visit. Renders nothing.
 */
export function RecordRecentlyViewed() {
  const { product } = useProduct()
  const record = useRecentlyViewed((state) => state.record)
  const recordVisit = useEffectEvent(() => record(cardFromDetail(product)))
  useEffect(() => recordVisit(), [product.slug])
  return null
}
